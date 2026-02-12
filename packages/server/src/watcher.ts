import chokidar from 'chokidar';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readdir, access, constants } from 'fs/promises';
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

function createDebouncer(delayMs: number) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounce(key: string, fn: () => void) {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, delayMs)
    );
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  return { debounce, clear };
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function startWatcher(stateManager: StateManager) {
  const fileOffsets = new Map<string, number>();
  const debouncer = createDebouncer(150);
  const transcriptDebouncer = createDebouncer(300);

  // Watch team configs - watch directory, filter to config.json in handlers
  const teamWatcher = chokidar.watch(TEAMS_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  teamWatcher.on('ready', () => {
    console.log('[watcher] Team watcher ready');
  });
  teamWatcher.on('add', (fp: string) => {
    if (basename(fp) !== 'config.json') return; // Filter to config.json only
    debouncer.debounce(`team:${fp}`, () => handleTeamConfig(fp));
  });
  teamWatcher.on('change', (fp: string) => {
    if (basename(fp) !== 'config.json') return; // Filter to config.json only
    debouncer.debounce(`team:${fp}`, () => handleTeamConfig(fp));
  });
  teamWatcher.on('unlink', (fp: string) => {
    console.log(`[watcher] Team config removed: ${fp}`);
    stateManager.reset();
  });
  teamWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Team watcher error:', err instanceof Error ? err.message : err);
  });

  async function handleTeamConfig(filePath: string) {
    if (!(await isReadable(filePath))) return;

    const config = await parseTeamConfig(filePath);
    if (!config) return;

    const teamName = basename(dirname(filePath));
    stateManager.setTeamName(teamName);
    stateManager.setAgents(config.members.map(teamMemberToAgent));

    await scanTasks(teamName);
  }

  // Watch task files (chokidar v4: watch dir, filter via ignored)
  const taskWatcher = chokidar.watch(TASKS_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 1,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    ignored: (path: string, stats?: { isDirectory(): boolean }) => {
      if (stats?.isDirectory()) return false;
      return !path.endsWith('.json');
    },
  });

  taskWatcher.on('ready', () => {
    console.log('[watcher] Task watcher ready');
  });
  taskWatcher.on('add', (fp: string) => {
    debouncer.debounce(`task:${fp}`, () => handleTaskFile(fp));
  });
  taskWatcher.on('change', (fp: string) => {
    debouncer.debounce(`task:${fp}`, () => handleTaskFile(fp));
  });
  taskWatcher.on('unlink', (fp: string) => {
    const taskId = basename(fp).replace('.json', '');
    console.log(`[watcher] Task file removed: ${fp} (id: ${taskId})`);
    stateManager.removeTask(taskId);
    stateManager.reconcileAgentStatuses();
  });
  taskWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Task watcher error:', err instanceof Error ? err.message : err);
  });

  async function handleTaskFile(filePath: string) {
    if (basename(filePath) === 'config.json') return;
    if (!(await isReadable(filePath))) return;

    const task = await parseTaskFile(filePath);
    if (!task) return;

    stateManager.updateTask(task);
    stateManager.reconcileAgentStatuses();
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
    } catch (err) {
      if (isNodeError(err) && err.code !== 'ENOENT') {
        console.warn(`[watcher] Error scanning tasks in ${taskDir}:`, err.message);
      }
    }
  }

  // Watch JSONL transcript files (chokidar v4: watch dir, filter via ignored)
  const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');
  const transcriptWatcher = chokidar.watch(PROJECTS_DIR, {
    ignoreInitial: true,
    persistent: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
    ignored: (path: string, stats?: { isDirectory(): boolean }) => {
      if (stats?.isDirectory()) return false;
      return !path.endsWith('.jsonl');
    },
  });

  transcriptWatcher.on('add', (filePath: string) => {
    fileOffsets.set(filePath, 0);
  });

  transcriptWatcher.on('change', (filePath: string) => {
    transcriptDebouncer.debounce(`transcript:${filePath}`, () => handleTranscriptChange(filePath));
  });

  transcriptWatcher.on('unlink', (filePath: string) => {
    fileOffsets.delete(filePath);
  });

  transcriptWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Transcript watcher error:', err instanceof Error ? err.message : err);
  });

  async function handleTranscriptChange(filePath: string) {
    const offset = fileOffsets.get(filePath) ?? 0;
    const { lines, newOffset } = await readNewLines(filePath, offset);
    fileOffsets.set(filePath, newOffset);

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed) continue;

      if (parsed.type === 'message' && parsed.message) {
        stateManager.addMessage(parsed.message);
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        if (parsed.agentName) {
          const state = stateManager.getState();
          const agent = state.agents.find((a) => a.name === parsed.agentName);
          if (agent && agent.status === 'working') {
            stateManager.updateAgentActivity(agent.name, 'working', parsed.toolName);
          }
        } else {
          const state = stateManager.getState();
          for (const agent of state.agents) {
            if (agent.status === 'working') {
              stateManager.updateAgentActivity(agent.name, 'working', parsed.toolName);
              break;
            }
          }
        }
      }
    }
  }

  console.log(`[watcher] Watching ${TEAMS_DIR}`);
  console.log(`[watcher] Watching ${TASKS_DIR}`);
  console.log(`[watcher] Watching transcripts in ${CLAUDE_DIR}/projects/`);

  return {
    close: () => {
      debouncer.clear();
      transcriptDebouncer.clear();
      teamWatcher.close();
      taskWatcher.close();
      transcriptWatcher.close();
    },
  };
}

interface NodeError extends Error {
  code: string;
}

function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
