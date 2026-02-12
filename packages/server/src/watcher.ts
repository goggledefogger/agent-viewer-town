import chokidar from 'chokidar';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readdir } from 'fs/promises';
import { StateManager } from './state';
import {
  parseTeamConfig,
  parseTaskFile,
  teamMemberToAgent,
  parseTranscriptLine,
  readNewLines,
} from './parser';

const CLAUDE_DIR = join(homedir(), '.claude');
const TEAMS_DIR = join(CLAUDE_DIR, 'teams');
const TASKS_DIR = join(CLAUDE_DIR, 'tasks');

export function startWatcher(stateManager: StateManager) {
  const fileOffsets = new Map<string, number>();

  // Watch team configs
  const teamWatcher = chokidar.watch(join(TEAMS_DIR, '*/config.json'), {
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  teamWatcher.on('add', handleTeamConfig);
  teamWatcher.on('change', handleTeamConfig);
  teamWatcher.on('unlink', () => {
    stateManager.reset();
  });

  async function handleTeamConfig(filePath: string) {
    const config = await parseTeamConfig(filePath);
    if (!config) return;

    const teamName = basename(dirname(filePath));
    stateManager.setTeamName(teamName);
    stateManager.setAgents(config.members.map(teamMemberToAgent));

    // Also scan for existing tasks
    await scanTasks(teamName);
  }

  // Watch task files
  const taskWatcher = chokidar.watch(join(TASKS_DIR, '*/*.json'), {
    ignoreInitial: false,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });

  taskWatcher.on('add', handleTaskFile);
  taskWatcher.on('change', handleTaskFile);

  async function handleTaskFile(filePath: string) {
    if (basename(filePath) === 'config.json') return;
    const task = await parseTaskFile(filePath);
    if (task) {
      stateManager.updateTask(task);

      // Update agent status based on task ownership
      if (task.owner && task.status === 'in_progress') {
        stateManager.updateAgentActivity(task.owner, 'working', task.subject);
      } else if (task.owner && task.status === 'completed') {
        stateManager.updateAgentActivity(task.owner, 'idle');
      }
    }
  }

  async function scanTasks(teamName: string) {
    const taskDir = join(TASKS_DIR, teamName);
    try {
      const files = await readdir(taskDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'config.json') {
          await handleTaskFile(join(taskDir, file));
        }
      }
    } catch {
      // task dir may not exist yet
    }
  }

  // Watch JSONL transcript files for message activity
  const transcriptWatcher = chokidar.watch(
    [join(CLAUDE_DIR, 'projects/*/*.jsonl'), join(CLAUDE_DIR, 'projects/*/subagents/*.jsonl')],
    {
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
    }
  );

  transcriptWatcher.on('add', (filePath: string) => {
    fileOffsets.set(filePath, 0);
  });

  transcriptWatcher.on('change', async (filePath: string) => {
    const offset = fileOffsets.get(filePath) || 0;
    const { lines, newOffset } = await readNewLines(filePath, offset);
    fileOffsets.set(filePath, newOffset);

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed) continue;

      if (parsed.type === 'message' && parsed.message) {
        stateManager.addMessage(parsed.message);
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        // Show tool activity for agents
        const state = stateManager.getState();
        for (const agent of state.agents) {
          if (agent.status === 'working') {
            stateManager.updateAgentActivity(agent.name, 'working', parsed.toolName);
            break;
          }
        }
      }
    }
  });

  console.log(`[watcher] Watching ${TEAMS_DIR}`);
  console.log(`[watcher] Watching ${TASKS_DIR}`);
  console.log(`[watcher] Watching transcripts in ${CLAUDE_DIR}/projects/`);

  return {
    close: () => {
      teamWatcher.close();
      taskWatcher.close();
      transcriptWatcher.close();
    },
  };
}
