import chokidar from 'chokidar';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readdir, access, constants, stat as fsStat } from 'fs/promises';
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
/** How often to check for stale sessions (ms) */
const STALENESS_CHECK_INTERVAL_MS = 15_000;
/** Seconds after a tool_use with no tool_result before marking "waiting for input" */
const WAITING_FOR_INPUT_DELAY_S = 60;

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
  /** Timestamp of the last tool_use seen without a corresponding tool_result */
  lastToolUseAt?: number;
  /** Name of the pending tool (for display) */
  pendingToolName?: string;
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
    if (basename(fp) !== 'config.json') return;
    const teamName = basename(dirname(fp));
    console.log(`[watcher] Team config removed: ${fp} (team: ${teamName})`);
    // Only reset team-related state, not solo sessions
    stateManager.clearTeamAgents();
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
    ignoreInitial: false, // Detect existing sessions on startup
    persistent: true,
    depth: 4, // Catch subagent transcripts at {project}/{session}/subagents/*.jsonl
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
  });

  let transcriptWatcherReady = false;
  transcriptWatcher.on('ready', () => {
    transcriptWatcherReady = true;
    console.log('[watcher] Transcript watcher ready');
    // Re-broadcast after a brief delay to allow pending async detectSession calls to finish
    setTimeout(() => {
      console.log(`[watcher] Initial scan complete, broadcasting ${stateManager.getSessions().size} sessions`);
      stateManager.broadcastSessionsList();
    }, 2000);
  });

  transcriptWatcher.on('add', async (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return;
    fileOffsets.set(filePath, 0);
    // Before 'ready', these are initial scan events — apply age filter
    await detectSession(filePath, !transcriptWatcherReady);
  });

  transcriptWatcher.on('change', (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return; // Filter to JSONL only
    transcriptDebouncer.debounce(`transcript:${filePath}`, () => handleTranscriptChange(filePath));
  });

  transcriptWatcher.on('unlink', (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return;
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
   * Read the first lines of a newly detected JSONL file to extract session metadata.
   * For solo sessions (no teamName), create a synthetic agent.
   *
   * On initial scan, skip files older than 1 hour to avoid flooding with
   * historical sessions. On change events (isInitial=false), always detect.
   */
  const MAX_INITIAL_AGE_S = 86400; // 24 hours

  async function detectSession(filePath: string, isInitial = false) {
    // On initial scan, skip very old files
    if (isInitial) {
      try {
        const stats = await fsStat(filePath);
        const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;
        if (ageSeconds > MAX_INITIAL_AGE_S) return;
      } catch {
        return;
      }
    }

    // Read up to the first 20 lines to find one with session metadata
    // (first lines may be file-history-snapshot without sessionId)
    const { lines, newOffset } = await readNewLines(filePath, 0);
    // Mark all existing content as read so handleTranscriptChange only processes new lines
    fileOffsets.set(filePath, newOffset);
    const linesToScan = lines.slice(0, 20);
    let meta: ReturnType<typeof parseSessionMetadata> = null;
    for (const line of linesToScan) {
      meta = parseSessionMetadata(line);
      if (meta) break;
    }
    if (!meta) return;

    // Extract the project directory slug from the file path
    // Path structure: ~/.claude/projects/{dirSlug}/{sessionId}.jsonl
    // or ~/.claude/projects/{dirSlug}/{sessionId}/subagents/{agentId}.jsonl
    const relPath = filePath.slice(PROJECTS_DIR.length + 1); // strip prefix + /
    const dirSlug = relPath.split('/')[0] || '';

    // Determine initial status from file freshness
    let initialStatus: 'working' | 'idle' = 'idle';
    try {
      const stats = await fsStat(filePath);
      const ageSeconds = (Date.now() - stats.mtimeMs) / 1000;
      initialStatus = ageSeconds < IDLE_THRESHOLD_S ? 'working' : 'idle';
    } catch { /* default to idle */ }

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
        `[watcher] New session detected: ${meta.sessionId} (${meta.isTeam ? 'team' : 'solo'}) - ${meta.projectName} [${initialStatus}]`
      );

      // For solo sessions, register agent in the registry
      if (!meta.isTeam) {
        const agentName = meta.slug || meta.projectName || 'claude';
        stateManager.registerAgent({
          id: meta.sessionId,
          name: agentName,
          role: 'implementer',
          status: initialStatus,
          tasksCompleted: 0,
        });
      }

      // Register the session (auto-selects if it's the first or most active)
      stateManager.addSession(meta);
    }
  }

  async function handleTranscriptChange(filePath: string) {
    // Re-detect session if it was previously removed (e.g., after timeout)
    if (!trackedSessions.has(filePath)) {
      await detectSession(filePath);
    }

    const offset = fileOffsets.get(filePath) ?? 0;
    const { lines, newOffset } = await readNewLines(filePath, offset);
    fileOffsets.set(filePath, newOffset);

    // Update last activity time for the tracked session
    const currentTracked = trackedSessions.get(filePath);
    if (currentTracked) {
      currentTracked.lastActivity = Date.now();
      stateManager.updateSessionActivity(currentTracked.sessionId);
    }

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed) continue;

      if (parsed.type === 'message' && parsed.message) {
        stateManager.addMessage(parsed.message);
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        // Record that a tool_use was seen — may trigger "waiting for input" later
        if (currentTracked) {
          currentTracked.lastToolUseAt = Date.now();
          currentTracked.pendingToolName = parsed.toolName;
        }

        // Immediately mark as waiting for AskUserQuestion (always requires input)
        if (parsed.isUserPrompt && currentTracked) {
          const agentName = currentTracked.isSolo
            ? getSoloAgentName(currentTracked.sessionId)
            : (parsed.agentName || findWorkingAgentName());
          if (agentName) {
            stateManager.setAgentWaiting(agentName, true, parsed.toolName);
          }
        }

        // For solo sessions, update the synthetic agent directly
        if (currentTracked?.isSolo) {
          stateManager.updateAgentActivity(
            getSoloAgentName(currentTracked.sessionId),
            'working',
            parsed.toolName
          );
          continue;
        }

        // For team sessions, match to the right agent
        if (parsed.agentName) {
          const state = stateManager.getState();
          const agent = state.agents.find((a) => a.name === parsed.agentName);
          if (agent) {
            stateManager.updateAgentActivity(agent.name, 'working', parsed.toolName);
          }
        } else {
          const agentName = findWorkingAgentName();
          if (agentName) {
            stateManager.updateAgentActivity(agentName, 'working', parsed.toolName);
          }
        }
      }

      // tool_result clears the "waiting for input" state
      if (parsed.type === 'agent_activity') {
        if (currentTracked) {
          currentTracked.lastToolUseAt = undefined;
          currentTracked.pendingToolName = undefined;
        }
        if (currentTracked?.isSolo) {
          const agentName = getSoloAgentName(currentTracked.sessionId);
          stateManager.setAgentWaiting(agentName, false);
          stateManager.updateAgentActivity(agentName, 'working');
        } else {
          // Clear waiting state for any agent in this session
          const agentName = parsed.agentName || findWorkingAgentName();
          if (agentName) {
            stateManager.setAgentWaiting(agentName, false);
          }
        }
      }
    }

    function findWorkingAgentName(): string | undefined {
      const state = stateManager.getState();
      for (const agent of state.agents) {
        if (agent.status === 'working') return agent.name;
      }
      return state.agents[0]?.name;
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
  // Periodic staleness + waiting-for-input check
  // ================================================================
  const stalenessInterval = setInterval(() => {
    const now = Date.now();

    for (const [, tracked] of trackedSessions) {
      if (!tracked.isSolo) continue;

      const idleSeconds = (now - tracked.lastActivity) / 1000;
      const agentName = getSoloAgentName(tracked.sessionId);

      // Check for "waiting for input": tool_use seen but no tool_result followed
      if (tracked.lastToolUseAt) {
        const waitingSeconds = (now - tracked.lastToolUseAt) / 1000;
        if (waitingSeconds >= WAITING_FOR_INPUT_DELAY_S) {
          stateManager.setAgentWaiting(
            agentName,
            true,
            tracked.pendingToolName
          );
        }
      }

      // Mark as idle after inactivity (but don't remove the session)
      if (idleSeconds >= IDLE_THRESHOLD_S) {
        // Clear stale waiting state — if truly idle, not waiting for input
        tracked.lastToolUseAt = undefined;
        tracked.pendingToolName = undefined;
        stateManager.setAgentWaiting(agentName, false);

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
