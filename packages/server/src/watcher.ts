import chokidar from 'chokidar';
import { join, basename, dirname } from 'path';
import { homedir } from 'os';
import { readdir, access, constants, stat as fsStat } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { StateManager } from './state';

const execFileAsync = promisify(execFile);
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
/**
 * Seconds after a tool_use with no tool_result before heuristically marking
 * "waiting for input". Set higher to avoid false positives from long tool
 * executions (builds, tests, etc.). Tools like AskUserQuestion are detected
 * immediately regardless of this delay.
 */
const WAITING_FOR_INPUT_DELAY_S = 45;

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
  /** True for internal subagents (acompact, etc.) that shouldn't be shown as characters */
  isInternalSubagent?: boolean;
}

export function startWatcher(stateManager: StateManager) {
  const fileOffsets = new Map<string, number>();
  const debouncer = createDebouncer(150);
  const transcriptDebouncer = createDebouncer(100);

  /** Track which sessionIds have been registered to prevent race-condition double-registration */
  const registeredSessions = new Set<string>();

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
    // No awaitWriteFinish here — we want real-time change events for live
    // activity detection (gear spinning, action bubbles). readNewLines() already
    // handles partial writes by only processing complete lines.
  });

  let transcriptWatcherReady = false;
  /** Track pending detectSession promises so we can await them all before broadcasting */
  let pendingDetections: Promise<void>[] = [];

  transcriptWatcher.on('ready', async () => {
    transcriptWatcherReady = true;
    console.log('[watcher] Transcript watcher ready, waiting for pending detections...');
    await Promise.allSettled(pendingDetections);
    pendingDetections = [];
    console.log(`[watcher] Initial scan complete, broadcasting ${stateManager.getSessions().size} sessions`);
    stateManager.selectMostRecentSession();
    stateManager.broadcastSessionsList();
  });

  transcriptWatcher.on('add', async (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return;
    fileOffsets.set(filePath, 0);
    // Before 'ready', these are initial scan events — apply age filter
    const promise = detectSession(filePath, !transcriptWatcherReady);
    if (!transcriptWatcherReady) {
      pendingDetections.push(promise);
    }
    await promise;
  });

  transcriptWatcher.on('change', (filePath: string) => {
    if (!filePath.endsWith('.jsonl')) return; // Filter to JSONL only
    // Only process real-time changes after the initial scan is complete.
    // During initial scan, detectSession already reads metadata and sets offsets.
    if (!transcriptWatcherReady) return;
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

    // IMPORTANT: For top-level transcript files (not subagent files), the filename
    // IS the session ID. The JSONL metadata's sessionId may reference a PARENT session
    // (e.g., for compacted/continued sessions). Use the filename as the authoritative
    // session ID in that case.
    const relSegments = relPath.split('/');
    if (relSegments.length === 2) {
      // Top-level file: {dirSlug}/{sessionId}.jsonl
      const filenameId = basename(filePath, '.jsonl');
      if (filenameId && filenameId !== meta.sessionId) {
        meta.sessionId = filenameId;
      }
    } else if (relSegments.length >= 4 && relSegments[2] === 'subagents') {
      // Subagent file: {dirSlug}/{parentSessionId}/subagents/{agentId}.jsonl
      const parentSessionId = relSegments[1];
      const subagentId = basename(filePath, '.jsonl');

      // Determine initial status from file mtime
      let subagentStatus: 'working' | 'idle' = 'idle';
      let subMtime = Date.now();
      try {
        const stats = await fsStat(filePath);
        subMtime = stats.mtimeMs;
        const ageSeconds = (Date.now() - subMtime) / 1000;
        subagentStatus = ageSeconds < IDLE_THRESHOLD_S ? 'working' : 'idle';

        // Skip old subagents during initial scan — only show recently active ones
        // (within 5 minutes to catch agents that just finished)
        if (isInitial && ageSeconds > 300) return;
      } catch { /* default to idle */ }

      // Filter out internal subagents (acompact = conversation compaction summarizer).
      // Instead of showing them as regular subagents, trigger the compact indicator on the parent.
      if (subagentId.startsWith('agent-acompact')) {
        if (parentSessionId) {
          stateManager.updateAgentActivityById(parentSessionId, 'working', 'Compacting conversation...');
        }
        // Track the file so we can clear the compacting status when it finishes
        trackedSessions.set(filePath, {
          sessionId: subagentId,
          filePath,
          isSolo: true,
          dirSlug,
          lastActivity: subMtime,
          isInternalSubagent: true,
        });
        console.log(`[watcher] Internal subagent (acompact) detected for parent=${parentSessionId.slice(0, 8)}, showing compacting status`);
        return;
      }

      // Extract a meaningful name from the subagent's first user message (the prompt)
      let subagentName = subagentId.slice(0, 12);
      for (const line of linesToScan) {
        try {
          const d = JSON.parse(line);
          // The first user message contains the Task tool's prompt
          if (d.type === 'user' && d.message?.content) {
            const content = typeof d.message.content === 'string'
              ? d.message.content
              : '';
            if (content) {
              // Take the first line or first 40 chars as the name
              const firstLine = content.split('\n')[0].trim();
              subagentName = firstLine.length > 40
                ? firstLine.slice(0, 37) + '...'
                : firstLine;
              break;
            }
          }
        } catch { /* skip */ }
      }

      // Register the subagent
      const subagent = {
        id: subagentId,
        name: subagentName,
        role: 'implementer' as const,
        status: subagentStatus,
        tasksCompleted: 0,
        isSubagent: true,
        parentAgentId: parentSessionId,
      };
      stateManager.registerAgent(subagent);

      // Track for transcript changes
      trackedSessions.set(filePath, {
        sessionId: subagentId,
        filePath,
        isSolo: true,
        dirSlug,
        lastActivity: subMtime,
      });

      // Add to display if parent session is active
      const activeSession = stateManager.getState().session;
      if (activeSession && activeSession.sessionId === parentSessionId) {
        stateManager.updateAgent(subagent);
      }

      console.log(
        `[watcher] Subagent detected: ${subagentId.slice(0, 8)} parent=${parentSessionId.slice(0, 8)} name="${subagentName}" [${subagentStatus}]`
      );
      return; // Don't continue with normal session registration
    }

    // Determine initial status and last activity from file modification time
    let initialStatus: 'working' | 'idle' = 'idle';
    let fileMtime = Date.now();
    try {
      const stats = await fsStat(filePath);
      fileMtime = stats.mtimeMs;
      const ageSeconds = (Date.now() - fileMtime) / 1000;
      initialStatus = ageSeconds < IDLE_THRESHOLD_S ? 'working' : 'idle';
    } catch { /* default to idle, current time */ }

    // Always read the real git branch from the working directory when possible.
    // JSONL metadata may be stale (branch changed after session started) or
    // missing entirely (compacted/continued sessions lose gitBranch metadata).
    // A git repo can only be on one branch at a time, so this is always accurate.
    if (meta.projectPath) {
      try {
        const { stdout } = await execFileAsync('git', ['branch', '--show-current'], {
          cwd: meta.projectPath,
          timeout: 3000,
        });
        const branch = stdout.trim();
        if (branch) {
          meta.gitBranch = branch;
        }
      } catch {
        // git not available or not a repo — keep whatever we had
      }
    }

    const tracked: TrackedSession = {
      sessionId: meta.sessionId,
      filePath,
      isSolo: !meta.isTeam,
      dirSlug,
      lastActivity: fileMtime,
    };
    trackedSessions.set(filePath, tracked);

    // Use the file's actual mtime as the session's last activity
    meta.lastActivity = fileMtime;

    // If no projectName was derived from cwd, use the directory slug
    if (!meta.projectName && dirSlug) {
      meta.projectName = cleanProjectName(dirSlug);
    }

    // Register or update the session.
    // Use registeredSessions to prevent race conditions where multiple async
    // detectSession calls for the same sessionId both pass the `has()` check.
    const alreadyRegistered = registeredSessions.has(meta.sessionId);
    if (!alreadyRegistered) {
      registeredSessions.add(meta.sessionId);
      console.log(
        `[watcher] New session detected: ${meta.sessionId} (${meta.isTeam ? 'team' : 'solo'}) - ${meta.projectName} [${initialStatus}] branch=${meta.gitBranch || 'n/a'}`
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
    } else {
      // Session already known (e.g. from another JSONL file like a subagent transcript).
      // Update lastActivity if this file is more recent.
      const existingSession = stateManager.getSessions().get(meta.sessionId);
      if (existingSession && fileMtime > existingSession.lastActivity) {
        existingSession.lastActivity = fileMtime;
      }
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

    const currentTracked = trackedSessions.get(filePath);

    // Only update last activity when there are actual new lines to process
    // (prevents empty file touches from making old sessions look active)
    let hadMeaningfulActivity = false;

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed) continue;

      if (parsed.type === 'message' && parsed.message) {
        hadMeaningfulActivity = true;
        stateManager.addMessage(parsed.message);
      }

      // Handle conversation compacting — show as a special agent action
      if (parsed.type === 'compact') {
        hadMeaningfulActivity = true;
        if (currentTracked?.isSolo) {
          stateManager.updateAgentActivityById(
            currentTracked.sessionId,
            'working',
            'Compacting conversation...'
          );
          // Clear pending tool state since compacting resets the context
          currentTracked.lastToolUseAt = undefined;
          currentTracked.pendingToolName = undefined;
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
        } else {
          // For team sessions, show compacting on the first agent (team lead)
          const state = stateManager.getState();
          if (state.agents.length > 0) {
            stateManager.updateAgentActivity(state.agents[0].name, 'working', 'Compacting conversation...');
          }
        }
      }

      // Handle thinking/responding state (assistant generating text between tool calls)
      if (parsed.type === 'thinking' && parsed.toolName) {
        hadMeaningfulActivity = true;
        // Clear any pending waitingForInput — the model is actively generating
        if (currentTracked) {
          currentTracked.lastToolUseAt = undefined;
          currentTracked.pendingToolName = undefined;
        }
        if (currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
          stateManager.updateAgentActivityById(
            currentTracked.sessionId,
            'working',
            parsed.toolName
          );
        } else {
          const agentName = parsed.agentName || findWorkingAgentName();
          if (agentName) {
            stateManager.setAgentWaiting(agentName, false);
            stateManager.updateAgentActivity(agentName, 'working', parsed.toolName);
          }
        }
      }

      if (parsed.type === 'tool_call' && parsed.toolName) {
        hadMeaningfulActivity = true;
        // Record that a tool_use was seen — may trigger "waiting for input" later
        if (currentTracked) {
          currentTracked.lastToolUseAt = Date.now();
          currentTracked.pendingToolName = parsed.toolName;
        }

        // Immediately mark as waiting for AskUserQuestion (always requires input)
        if (parsed.isUserPrompt && currentTracked) {
          if (currentTracked.isSolo) {
            stateManager.setAgentWaitingById(currentTracked.sessionId, true, parsed.toolName);
          } else {
            const agentName = parsed.agentName || findWorkingAgentName();
            if (agentName) {
              stateManager.setAgentWaiting(agentName, true, parsed.toolName);
            }
          }
        }

        // For solo sessions, update the synthetic agent directly (by ID to avoid cross-session collision)
        if (currentTracked?.isSolo) {
          stateManager.updateAgentActivityById(
            currentTracked.sessionId,
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

      // Progress entries (bash_progress, etc.) mean the tool is actively running.
      // Reset the waiting-for-input timer — definitely NOT waiting for approval.
      if (parsed.type === 'progress') {
        hadMeaningfulActivity = true;
        if (currentTracked) {
          // Push the lastToolUseAt forward so the delayed timeout doesn't fire
          currentTracked.lastToolUseAt = Date.now();
        }
        // Optionally update the action display
        if (parsed.toolName && currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
        }
      }

      // tool_result clears the "waiting for input" state but keeps the last action visible
      if (parsed.type === 'agent_activity') {
        hadMeaningfulActivity = true;
        if (currentTracked) {
          currentTracked.lastToolUseAt = undefined;
          currentTracked.pendingToolName = undefined;
        }
        if (currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
          // Keep the last action visible — don't clear currentAction on tool_result.
          // The next tool_call will overwrite it. This prevents flickering.
        } else {
          // Clear waiting state for any agent in this session
          const agentName = parsed.agentName || findWorkingAgentName();
          if (agentName) {
            stateManager.setAgentWaiting(agentName, false);
          }
        }
      }
    }

    // Only update session activity timestamp when we processed meaningful events
    // AND the file itself is recently modified (prevents historical data from
    // inflating timestamps due to detectSession race conditions).
    if (hadMeaningfulActivity && currentTracked) {
      try {
        const stats = await fsStat(filePath);
        const fileAgeSeconds = (Date.now() - stats.mtimeMs) / 1000;
        if (fileAgeSeconds < 300) { // Only for files modified in last 5 minutes
          currentTracked.lastActivity = Date.now();
          stateManager.updateSessionActivity(currentTracked.sessionId);
        }
      } catch {
        // If we can't stat, don't update activity
      }
    }

    // After processing all lines, schedule a delayed check for pending tool_use
    // without a tool_result — this catches permission prompts faster than the
    // periodic staleness check alone. Capture the exact timestamp so we only
    // trigger for THIS specific tool_use (not a later one that happened to set
    // a new lastToolUseAt).
    // Skip for subagents and internal subagents — they don't need user input.
    const trackedAgent = currentTracked ? stateManager.getAgentById(currentTracked.sessionId) : undefined;
    if (currentTracked?.lastToolUseAt && currentTracked.isSolo && !trackedAgent?.isSubagent && !currentTracked.isInternalSubagent) {
      const sessionId = currentTracked.sessionId;
      const capturedToolUseAt = currentTracked.lastToolUseAt;
      setTimeout(() => {
        // Only mark waiting if THIS specific tool_use is still pending
        // (a new tool_use would have a different timestamp)
        if (currentTracked.lastToolUseAt === capturedToolUseAt) {
          stateManager.setAgentWaitingById(sessionId, true, currentTracked.pendingToolName);
        }
      }, WAITING_FOR_INPUT_DELAY_S * 1000);
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

      // Check for "waiting for input": tool_use seen but no tool_result followed
      // Skip for subagents and internal subagents — they don't need user input
      const trackedAgentForStale = stateManager.getAgentById(tracked.sessionId);
      if (tracked.lastToolUseAt && !trackedAgentForStale?.isSubagent && !tracked.isInternalSubagent) {
        const waitingSeconds = (now - tracked.lastToolUseAt) / 1000;
        if (waitingSeconds >= WAITING_FOR_INPUT_DELAY_S) {
          stateManager.setAgentWaitingById(
            tracked.sessionId,
            true,
            tracked.pendingToolName
          );
        }
      }

      // Internal subagents (acompact): just clean up tracking when done, no display
      if (tracked.isInternalSubagent && idleSeconds >= IDLE_THRESHOLD_S) {
        trackedSessions.delete(tracked.filePath);
        continue;
      }

      // Mark as idle after inactivity (but don't remove the session)
      if (idleSeconds >= IDLE_THRESHOLD_S) {
        // Clear stale waiting state — if truly idle, not waiting for input
        tracked.lastToolUseAt = undefined;
        tracked.pendingToolName = undefined;
        stateManager.setAgentWaitingById(tracked.sessionId, false);

        const agent = stateManager.getAgentById(tracked.sessionId);
        if (agent && agent.status === 'working') {
          // For subagents, show "Done" when they finish instead of clearing the action
          if (agent.isSubagent) {
            stateManager.updateAgentActivityById(tracked.sessionId, 'done', 'Done');
          } else {
            stateManager.updateAgentActivityById(tracked.sessionId, 'idle');
          }
        }

        // Remove subagents from display after 5 minutes of inactivity
        if (agent?.isSubagent && idleSeconds >= 300) {
          stateManager.removeAgent(tracked.sessionId);
          trackedSessions.delete(tracked.filePath);
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
