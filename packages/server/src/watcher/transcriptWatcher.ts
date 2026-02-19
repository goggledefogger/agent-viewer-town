import chokidar from 'chokidar';
import { basename, dirname } from 'path';
import { stat as fsStat } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  parseTranscriptLine,
  parseSessionMetadata,
  readNewLines,
  cleanProjectName,
  detectGitWorktree,
} from '../parser';
import { isReadable } from './utils';
import {
  PROJECTS_DIR,
  IDLE_THRESHOLD_S,
  MAX_INITIAL_AGE_S,
} from './types';
import type { WatcherContext, TrackedSession } from './types';
import { runStalenessCheck } from './stalenessChecker';
import { detectSubagent } from './subagentDetector';

const execFileAsync = promisify(execFile);

export function startTranscriptWatcher(ctx: WatcherContext) {
  const {
    stateManager,
    fileOffsets,
    transcriptDebouncer,
    registeredSessions,
    registeredSubagents,
    trackedSessions,
  } = ctx;

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
    // Run staleness check immediately to clean up stale subagents and sessions
    // before the first broadcast, rather than waiting for the 15s interval.
    runStalenessCheck(ctx);
    stateManager.selectMostInterestingSession();
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
      registeredSubagents.delete(tracked.sessionId);
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

      await detectSubagent({
        filePath,
        parentSessionId,
        subagentId,
        dirSlug,
        lines,
        linesToScan,
        isInitial,
        stateManager,
        trackedSessions,
        registeredSubagents,
      });
      return; // Don't continue with normal session registration
    }

    // Determine initial status and last activity from file modification time.
    // Use a tiered heuristic: files actively being written to (< 10s) are likely
    // working; files idle for 10-60s are ambiguous; files idle > 60s are definitely idle.
    let initialStatus: 'working' | 'idle' = 'idle';
    let fileMtime = Date.now();
    try {
      const stats = await fsStat(filePath);
      fileMtime = stats.mtimeMs;
      const ageSeconds = (Date.now() - fileMtime) / 1000;
      // Only default to 'working' if the file is VERY recently modified (< 10s).
      // This prevents showing stale "working" status for agents that finished
      // responding 30-50 seconds ago but haven't been idle long enough for
      // staleness check to fire.
      initialStatus = ageSeconds < 10 ? 'working' : 'idle';
    } catch { /* default to idle, current time */ }

    // If a Stop hook has already fired for this session, respect it.
    // This handles the case where the server restarts (tsx watch) and re-detects
    // sessions — the stoppedSessions set persists in StateManager.
    if (stateManager.isSessionStopped(meta.sessionId)) {
      initialStatus = 'idle';
    }

    // Read the tail of the transcript to determine accurate initial state.
    // Without this, agents show as just "working" or "idle" with no currentAction.
    // IMPORTANT: Don't break on the first tool_call — scan the full window to
    // check if a turn_end exists, which definitively means the agent is idle.
    let initialAction: string | undefined;
    let initialWaiting = false;
    let foundTurnEnd = false;
    let foundToolCall: { toolName: string; isUserPrompt: boolean } | null = null;
    let foundThinking: string | null = null;
    let foundCompact = false;

    const tailLines = lines.slice(-30);
    for (let i = tailLines.length - 1; i >= 0; i--) {
      const parsed = parseTranscriptLine(tailLines[i]);
      if (!parsed) continue;

      // turn_duration = definitive signal that the last turn completed.
      if (parsed.type === 'turn_end') {
        foundTurnEnd = true;
        break;
      }
      // Record the first tool_call we find but DON'T break — keep scanning
      // for a turn_end that may appear further back in the window.
      if (parsed.type === 'tool_call' && parsed.toolName && !foundToolCall) {
        foundToolCall = { toolName: parsed.toolName, isUserPrompt: !!parsed.isUserPrompt };
        continue;
      }
      if (parsed.type === 'agent_activity') {
        // tool_result — agent is between actions, treat as a natural break point
        break;
      }
      if (parsed.type === 'thinking' && parsed.toolName && !foundThinking) {
        foundThinking = parsed.toolName;
        continue;
      }
      if (parsed.type === 'compact' && !foundCompact) {
        foundCompact = true;
        continue;
      }
    }

    // Apply findings in priority order
    if (foundTurnEnd) {
      initialStatus = 'idle';
    } else if (foundToolCall) {
      initialAction = foundToolCall.toolName;
      if (foundToolCall.isUserPrompt) initialWaiting = true;
    } else if (foundThinking) {
      initialAction = foundThinking;
    } else if (foundCompact) {
      initialAction = 'Compacting conversation...';
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

      // Check if an acompact subagent was already detected for this session
      // (race: subagent file may be scanned before parent). If so, override
      // the initial idle status with compacting.
      if (initialStatus === 'idle') {
        for (const t of trackedSessions.values()) {
          if (t.isInternalSubagent && t.filePath.includes(`/${meta.sessionId}/`)) {
            const acompactAgeS = (Date.now() - t.lastActivity) / 1000;
            if (acompactAgeS < IDLE_THRESHOLD_S) {
              stateManager.updateAgentActivityById(meta.sessionId, 'working', 'Compacting conversation...');
              break;
            }
          }
        }
      }

      // For team sessions, register session-to-agent mapping so hook events
      // (which use JSONL session UUIDs) can route to the correct team agent
      // (which uses config-based IDs like "researcher@team-name").
      if (meta.isTeam && meta.agentId) {
        stateManager.registerSessionToAgentMapping(meta.sessionId, meta.agentId);
      }
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

    // If hooks are actively providing events for this session, defer to them
    // for activity/status updates. Hooks are more accurate and real-time than
    // JSONL parsing. Still process messages and other non-status data.
    const hookActive = currentTracked
      ? stateManager.isHookActive(currentTracked.sessionId)
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

      // Skip activity/status updates if:
      // 1. The session was stopped by a hook (trailing JSONL must not override idle)
      // 2. Hooks are actively providing events (JSONL is delayed and would override
      //    more accurate hook-set status, e.g., showing "Reading file" instead of
      //    "Compacting conversation..." set by PreCompact hook)
      if (sessionStopped || hookActive) continue;

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
          // Determine the specific waiting type from the raw tool name
          let waitingType: 'question' | 'plan' | 'plan_approval' | undefined;
          if (parsed.rawToolName === 'AskUserQuestion') waitingType = 'question';
          else if (parsed.rawToolName === 'EnterPlanMode' || parsed.rawToolName === 'ExitPlanMode') waitingType = 'plan';

          if (currentTracked.isSolo) {
            stateManager.setAgentWaitingById(currentTracked.sessionId, true, parsed.toolName, undefined, waitingType);
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

      // Progress entries — tool is actively running. Set to working (catches
      // idle→working transition when hooks are delayed) and clear waiting state.
      if (parsed.type === 'progress') {
        if (currentTracked?.isSolo) {
          const progressAgent = stateManager.getAgentById(currentTracked.sessionId);
          if (progressAgent && progressAgent.status !== 'working') {
            stateManager.updateAgentActivityById(
              currentTracked.sessionId,
              'working',
              parsed.toolName || 'Working...'
            );
          }
          if (parsed.toolName) {
            stateManager.setAgentWaitingById(currentTracked.sessionId, false);
          }
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

      // Turn ended — agent finished responding, transition to idle.
      // This is the JSONL equivalent of the Stop hook. Critical for sessions
      // where hooks aren't installed — without this, the agent stays "working"
      // until the 60s staleness checker fires.
      if (parsed.type === 'turn_end') {
        if (currentTracked?.isSolo) {
          stateManager.setAgentWaitingById(currentTracked.sessionId, false);
          stateManager.updateAgentActivityById(currentTracked.sessionId, 'idle');
        } else {
          const agentName = findWorkingAgentName();
          if (agentName) {
            stateManager.setAgentWaiting(agentName, false);
            stateManager.updateAgentActivity(agentName, 'idle');
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

  return transcriptWatcher;
}
