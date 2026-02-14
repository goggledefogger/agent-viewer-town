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
  cleanProjectName,
  detectGitWorktree,
} from './parser';

const CLAUDE_DIR = join(homedir(), '.claude');
const TEAMS_DIR = join(CLAUDE_DIR, 'teams');
const TASKS_DIR = join(CLAUDE_DIR, 'tasks');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

/** Seconds of inactivity before marking a session idle */
const IDLE_THRESHOLD_S = 60;
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

      // Determine initial status from file mtime + tail scan
      let subagentStatus: 'working' | 'idle' = 'idle';
      let subMtime = Date.now();

      // If stopped by hook, return immediately to prevent resurrection
      if (stateManager.isSessionStopped(subagentId)) {
        return;
      }

      try {
        const stats = await fsStat(filePath);
        subMtime = stats.mtimeMs;
        const ageSeconds = (Date.now() - subMtime) / 1000;
        subagentStatus = ageSeconds < IDLE_THRESHOLD_S ? 'working' : 'idle';

        // Skip old subagents during initial scan — only show recently active ones
        // (within 5 minutes to catch agents that just finished)
        if (isInitial && ageSeconds > 300) return;
      } catch { /* default to idle */ }

      // Check tail for turn_end — overrides mtime-based status
      if (subagentStatus === 'working') {
        const subTail = lines.slice(-15);
        for (let i = subTail.length - 1; i >= 0; i--) {
          const parsed = parseTranscriptLine(subTail[i]);
          if (!parsed) continue;
          if (parsed.type === 'turn_end') {
            subagentStatus = 'idle';
            break;
          }
          if (parsed.type === 'tool_call' || parsed.type === 'thinking') break;
        }
      }

      // Filter out internal subagents (acompact = conversation compaction summarizer).
      // Instead of showing them as regular subagents, trigger the compact indicator on the parent.
      // Only set compacting status if the acompact file is recent — stale files from
      // past compactions should not mark the parent as currently compacting.
      if (subagentId.startsWith('agent-acompact')) {
        const acompactAgeS = (Date.now() - subMtime) / 1000;
        if (parentSessionId && acompactAgeS < IDLE_THRESHOLD_S) {
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

    // If a Stop hook has already fired for this session, respect it.
    // This handles the case where the server restarts (tsx watch) and re-detects
    // sessions — the stoppedSessions set persists in StateManager.
    if (stateManager.isSessionStopped(meta.sessionId)) {
      initialStatus = 'idle';
    }

    // Read the tail of the transcript to determine accurate initial state.
    // Without this, agents show as just "working" or "idle" with no currentAction.
    let initialAction: string | undefined;
    let initialWaiting = false;
    const tailLines = lines.slice(-30);
    for (let i = tailLines.length - 1; i >= 0; i--) {
      const parsed = parseTranscriptLine(tailLines[i]);
      if (!parsed) continue;

      // turn_duration = definitive signal that the last turn completed.
      // The session is idle regardless of file mtime.
      if (parsed.type === 'turn_end') {
        initialStatus = 'idle';
        break;
      }
      if (parsed.type === 'tool_call' && parsed.toolName) {
        initialAction = parsed.toolName;
        if (parsed.isUserPrompt) initialWaiting = true;
        break;
      }
      if (parsed.type === 'agent_activity') {
        // Last meaningful event was a tool_result — agent is between actions
        break;
      }
      if (parsed.type === 'thinking' && parsed.toolName) {
        initialAction = parsed.toolName;
        break;
      }
      if (parsed.type === 'compact') {
        initialAction = 'Compacting conversation...';
        break;
      }
    }

    // Always read the real git branch and worktree info from the working directory.
    // JSONL metadata may be stale (branch changed after session started) or
    // missing entirely (compacted/continued sessions lose gitBranch metadata).
    if (meta.projectPath) {
      const gitInfo = await detectGitWorktree(meta.projectPath, execFileAsync);
      if (gitInfo.gitBranch) {
        meta.gitBranch = gitInfo.gitBranch;
      }
      if (gitInfo.gitWorktree) {
        meta.gitWorktree = gitInfo.gitWorktree;
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
          currentAction: initialStatus === 'working' ? initialAction : undefined,
          waitingForInput: initialStatus === 'working' ? initialWaiting : false,
          gitBranch: meta.gitBranch,
          gitWorktree: meta.gitWorktree,
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

    // If a Stop hook has fired for this session, don't let trailing JSONL lines
    // override the idle state. The Stop hook is the definitive signal that the
    // agent finished responding. Still process messages and other non-status data.
    const sessionStopped = currentTracked
      ? stateManager.isSessionStopped(currentTracked.sessionId)
      : false;

    // Only update last activity when there are actual new lines to process
    // (prevents empty file touches from making old sessions look active)
    let hadMeaningfulActivity = false;

    for (const line of lines) {
      const parsed = parseTranscriptLine(line);
      if (!parsed || parsed.type === 'unknown') continue;

      hadMeaningfulActivity = true;

      // Extract messages (SendMessage tool calls from JSONL)
      if (parsed.type === 'message' && parsed.message) {
        stateManager.addMessage(parsed.message);
      }

      // Skip activity/status updates if the session was stopped by a hook.
      // Trailing JSONL lines from before the Stop must not override idle state.
      if (sessionStopped) continue;

      // Handle conversation compacting — show as a special agent action
      if (parsed.type === 'compact') {
        if (currentTracked?.isSolo) {
          stateManager.updateAgentActivityById(
            currentTracked.sessionId,
            'working',
            'Compacting conversation...'
          );
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
        } else {
          const state = stateManager.getState();
          if (state.agents.length > 0) {
            stateManager.updateAgentActivity(state.agents[0].name, 'working', 'Compacting conversation...');
          }
        }
      }

      // Thinking/responding — agent is actively generating (not waiting for input)
      if (parsed.type === 'thinking' && parsed.toolName) {
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

      // Tool call — update activity display. Only set waitingForInput for tools
      // that definitively require user input (AskUserQuestion, EnterPlanMode, etc.).
      // For all other tools, waiting-for-input detection is left to hooks
      // (PermissionRequest) which are more reliable.
      if (parsed.type === 'tool_call' && parsed.toolName) {
        // Immediately mark as waiting for tools that always require user input
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

        // Update the activity display (tool name / action)
        if (currentTracked?.isSolo) {
          stateManager.updateAgentActivityById(
            currentTracked.sessionId,
            'working',
            parsed.toolName
          );
          continue;
        }

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

      // Progress entries — tool is actively running, clear any waiting state
      if (parsed.type === 'progress') {
        if (parsed.toolName && currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
        }
      }

      // Tool result — clear waiting state, keep last action visible
      if (parsed.type === 'agent_activity') {
        if (currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
        } else {
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
  // Periodic staleness check — marks idle sessions, cleans up subagents
  // ================================================================
  const stalenessInterval = setInterval(() => {
    const now = Date.now();

    // --- Check JSONL-tracked sessions (solo sessions and subagents) ---
    for (const [, tracked] of trackedSessions) {
      if (!tracked.isSolo) continue;

      const agent = stateManager.getAgentById(tracked.sessionId);

      // Cleanup tracked sessions for agents removed by hooks (SubagentStop)
      // If agent is missing from registry but we're still tracking it, remove tracking.
      if (!agent && tracked.sessionId !== stateManager.getState().session?.sessionId) {
        trackedSessions.delete(tracked.filePath);
        continue;
      }

      // Use the most recent activity from either JSONL file changes OR hook events.
      // Hooks update session.lastActivity via stateManager.updateSessionActivity(),
      // but that's a different timestamp than tracked.lastActivity (JSONL-based).
      // We must check both so hook activity prevents false idle transitions.
      const sessionActivity = stateManager.getSessions().get(tracked.sessionId)?.lastActivity ?? 0;
      const mostRecentActivity = Math.max(tracked.lastActivity, sessionActivity);
      const idleSeconds = (now - mostRecentActivity) / 1000;

      // Internal subagents (acompact): just clean up tracking when done, no display
      if (tracked.isInternalSubagent && idleSeconds >= IDLE_THRESHOLD_S) {
        trackedSessions.delete(tracked.filePath);
        continue;
      }

      // Mark as idle after inactivity (but don't remove the session)
      if (idleSeconds >= IDLE_THRESHOLD_S) {
        stateManager.setAgentWaitingById(tracked.sessionId, false);

        if (agent && agent.status === 'working') {
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

    // --- Check hook-tracked agents (team members without JSONL entries) ---
    // Team agents created via hooks may not have trackedSessions entries.
    // Use hook-updated session.lastActivity as the activity source.
    const checkedIds = new Set([...trackedSessions.values()].map(t => t.sessionId));
    for (const session of stateManager.getSessions().values()) {
      // Skip sessions already covered by JSONL tracking above
      if (checkedIds.has(session.sessionId)) continue;

      const idleSeconds = (now - session.lastActivity) / 1000;
      if (idleSeconds < IDLE_THRESHOLD_S) continue;

      // Mark all working agents for this session as idle
      const state = stateManager.getState();
      for (const agent of state.agents) {
        if (agent.status !== 'working') continue;

        // Check if this agent belongs to this session (team member or the session agent itself)
        if (agent.id === session.sessionId || agent.teamName === session.teamName) {
          stateManager.setAgentWaitingById(agent.id, false);
          stateManager.updateAgentActivityById(agent.id, 'idle');
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
