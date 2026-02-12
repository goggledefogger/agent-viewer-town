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
  parseSessionMetadata,
  readNewLines,
  readFirstLine,
  cleanProjectName,
} from './parser';

const CLAUDE_DIR = join(homedir(), '.claude');
const TEAMS_DIR = join(CLAUDE_DIR, 'teams');
const TASKS_DIR = join(CLAUDE_DIR, 'tasks');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

/** Seconds of inactivity before marking a session idle */
const IDLE_THRESHOLD_S = 60;
/** Seconds of inactivity before removing a session entirely */
const REMOVE_THRESHOLD_S = 120;
/** How often to check for stale sessions (ms) */
const STALENESS_CHECK_INTERVAL_MS = 15_000;

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

/** Track which JSONL files map to which sessionId */
interface TrackedSession {
  sessionId: string;
  filePath: string;
  /** Whether this is a solo session (no teamName) */
  isSolo: boolean;
  /** Project directory slug from the file path */
  dirSlug: string;
  lastActivity: number;
}

export function startWatcher(stateManager: StateManager) {
  const fileOffsets = new Map<string, number>();
  const debouncer = createDebouncer(150);
  const transcriptDebouncer = createDebouncer(300);

  /** Map from JSONL file path to session tracking info */
  const trackedSessions = new Map<string, TrackedSession>();

  // ================================================================
  // Team config watcher
  // ================================================================
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
    if (basename(fp) !== 'config.json') return;
    debouncer.debounce(`team:${fp}`, () => handleTeamConfig(fp));
  });
  teamWatcher.on('change', (fp: string) => {
    if (basename(fp) !== 'config.json') return;
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

  // ================================================================
  // Task file watcher
  // ================================================================
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

  // ================================================================
  // JSONL transcript watcher - now with session detection
  // ================================================================
  const transcriptWatcher = chokidar.watch(PROJECTS_DIR, {
    ignoreInitial: false, // Changed: detect existing sessions on startup
    persistent: true,
    depth: 4, // Increased: catch subagent transcripts at {project}/{session}/subagents/*.jsonl
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
    ignored: (path: string, stats?: { isDirectory(): boolean }) => {
      if (stats?.isDirectory()) return false;
      return !path.endsWith('.jsonl');
    },
  });

  transcriptWatcher.on('ready', () => {
    console.log('[watcher] Transcript watcher ready');
  });

  transcriptWatcher.on('add', async (filePath: string) => {
    fileOffsets.set(filePath, 0);
    await detectSession(filePath);
  });

  transcriptWatcher.on('change', (filePath: string) => {
    transcriptDebouncer.debounce(`transcript:${filePath}`, () => handleTranscriptChange(filePath));
  });

  transcriptWatcher.on('unlink', (filePath: string) => {
    fileOffsets.delete(filePath);
    const tracked = trackedSessions.get(filePath);
    if (tracked) {
      trackedSessions.delete(filePath);
      // Only remove the session if no other files reference the same sessionId
      const hasOtherFiles = [...trackedSessions.values()].some(
        (t) => t.sessionId === tracked.sessionId
      );
      if (!hasOtherFiles && tracked.isSolo) {
        removeSoloSession(tracked.sessionId);
      }
    }
  });

  transcriptWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Transcript watcher error:', err instanceof Error ? err.message : err);
  });

  /**
   * Read the first line of a newly detected JSONL file to extract session metadata.
   * For solo sessions (no teamName), create a synthetic agent.
   */
  async function detectSession(filePath: string) {
    const firstLine = await readFirstLine(filePath);
    if (!firstLine) return;

    const meta = parseSessionMetadata(firstLine);
    if (!meta) return;

    // Extract the project directory slug from the file path
    // Path structure: ~/.claude/projects/{dirSlug}/{sessionId}.jsonl
    // or ~/.claude/projects/{dirSlug}/{sessionId}/subagents/{agentId}.jsonl
    const relPath = filePath.slice(PROJECTS_DIR.length + 1); // strip prefix + /
    const dirSlug = relPath.split('/')[0] || '';

    const tracked: TrackedSession = {
      sessionId: meta.sessionId,
      filePath,
      isSolo: !meta.isTeam,
      dirSlug,
      lastActivity: Date.now(),
    };
    trackedSessions.set(filePath, tracked);

    // If no projectName was derived from cwd, use the directory slug
    if (!meta.projectName && dirSlug) {
      meta.projectName = cleanProjectName(dirSlug);
    }

    // Register the session
    const existingSessions = stateManager.getSessions();
    if (!existingSessions.has(meta.sessionId)) {
      console.log(
        `[watcher] New session detected: ${meta.sessionId} (${meta.isTeam ? 'team' : 'solo'}) - ${meta.projectName}`
      );
      stateManager.setSession(meta);

      // For solo sessions, create a synthetic agent
      if (!meta.isTeam) {
        const agentName = meta.slug || meta.projectName || 'claude';
        stateManager.setTeamName(meta.projectName || cleanProjectName(dirSlug));
        stateManager.updateAgent({
          id: meta.sessionId,
          name: agentName,
          role: 'implementer',
          status: 'working',
          tasksCompleted: 0,
        });
      }
    }
  }

  async function handleTranscriptChange(filePath: string) {
    const offset = fileOffsets.get(filePath) ?? 0;
    const { lines, newOffset } = await readNewLines(filePath, offset);
    fileOffsets.set(filePath, newOffset);

    // Update last activity time for the tracked session
    const tracked = trackedSessions.get(filePath);
    if (tracked) {
      tracked.lastActivity = Date.now();
      stateManager.updateSessionActivity(tracked.sessionId);
    }

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed) continue;

      if (parsed.type === 'message' && parsed.message) {
        stateManager.addMessage(parsed.message);
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        // For solo sessions, update the synthetic agent directly
        if (tracked?.isSolo) {
          stateManager.updateAgentActivity(
            getSoloAgentName(tracked.sessionId),
            'working',
            parsed.toolName
          );
          continue;
        }

        // For team sessions, match to the right agent
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

      // For solo sessions, assistant/tool_result entries indicate activity
      if (tracked?.isSolo && parsed.type === 'agent_activity') {
        stateManager.updateAgentActivity(
          getSoloAgentName(tracked.sessionId),
          'working'
        );
      }
    }
  }

  /**
   * Get the agent name for a solo session.
   * The agent uses the session's slug as its name.
   */
  function getSoloAgentName(sessionId: string): string {
    const session = stateManager.getSessions().get(sessionId);
    return session?.slug || session?.projectName || 'claude';
  }

  /**
   * Remove a solo session's synthetic agent and session record.
   */
  function removeSoloSession(sessionId: string) {
    console.log(`[watcher] Removing solo session: ${sessionId}`);
    stateManager.removeAgent(sessionId);
    stateManager.removeSession(sessionId);
  }

  // ================================================================
  // Periodic staleness check for sessions
  // ================================================================
  const stalenessInterval = setInterval(() => {
    const now = Date.now();

    for (const [filePath, tracked] of trackedSessions) {
      if (!tracked.isSolo) continue; // Only manage solo session lifecycle

      const idleSeconds = (now - tracked.lastActivity) / 1000;

      if (idleSeconds >= REMOVE_THRESHOLD_S) {
        // Session is stale -- remove it
        console.log(
          `[watcher] Solo session ${tracked.sessionId} inactive for ${Math.round(idleSeconds)}s, removing`
        );
        trackedSessions.delete(filePath);
        fileOffsets.delete(filePath);
        // Only remove if no other files reference the same sessionId
        const hasOtherFiles = [...trackedSessions.values()].some(
          (t) => t.sessionId === tracked.sessionId
        );
        if (!hasOtherFiles) {
          removeSoloSession(tracked.sessionId);
        }
      } else if (idleSeconds >= IDLE_THRESHOLD_S) {
        // Mark the solo agent as idle
        const agentName = getSoloAgentName(tracked.sessionId);
        const state = stateManager.getState();
        const agent = state.agents.find((a) => a.name === agentName);
        if (agent && agent.status === 'working') {
          stateManager.updateAgentActivity(agentName, 'idle');
        }
      }
    }
  }, STALENESS_CHECK_INTERVAL_MS);

  console.log(`[watcher] Watching ${TEAMS_DIR}`);
  console.log(`[watcher] Watching ${TASKS_DIR}`);
  console.log(`[watcher] Watching transcripts in ${PROJECTS_DIR}`);

  return {
    close: () => {
      clearInterval(stalenessInterval);
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
