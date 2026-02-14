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

      // Determine initial status from file mtime + tail scan
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

      // Extract a meaningful name and subagent type from the JSONL content
      let subagentName = subagentId.slice(0, 12);
      let subagentType: string | undefined;
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
          // System messages may contain agent metadata with subagent_type
          if (d.type === 'system' && d.subagent_type) {
            subagentType = d.subagent_type;
          }
        } catch { /* skip */ }
      }
      // Fall back to inferring type from agent ID prefix pattern
      if (!subagentType) {
        if (subagentId.startsWith('agent-explore')) subagentType = 'Explore';
        else if (subagentId.startsWith('agent-plan')) subagentType = 'Plan';
        else if (subagentId.startsWith('agent-bash')) subagentType = 'Bash';
      }

      // Skip re-registration of recently removed subagents (prevents stale re-detection
      // after SubagentStop hook → 15s removal → Chokidar delayed file detection)
      if (stateManager.wasRecentlyRemoved(subagentId)) {
        console.log(`[watcher] Skipping recently removed subagent: ${subagentId.slice(0, 8)}`);
        return;
      }

      // Skip if already registered (prevents duplicate detection from multiple file events)
      if (registeredSubagents.has(subagentId)) {
        return;
      }

      // Skip if hooks already registered this subagent and it's done
      // (SubagentStop already marked it as finished — don't resurrect it)
      const existingSubagent = stateManager.getAgentById(subagentId);
      if (existingSubagent?.status === 'done') {
        console.log(`[watcher] Skipping done subagent: ${subagentId.slice(0, 8)}`);
        return;
      }

      registeredSubagents.add(subagentId);

      // Register the subagent
      const subagent = {
        id: subagentId,
        name: subagentName,
        role: 'implementer' as const,
        status: subagentStatus,
        tasksCompleted: 0,
        isSubagent: true,
        parentAgentId: parentSessionId,
        subagentType,
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

  return transcriptWatcher;
}
