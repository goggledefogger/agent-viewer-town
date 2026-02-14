/**
 * Hook event handler — processes lifecycle events from Claude Code hooks.
 *
 * This is the orchestrator that dispatches events to domain-specific handlers:
 * - describeAction: Human-readable tool action formatting
 * - subagents: SubagentStart/Stop lifecycle and pending spawn correlation
 * - teamTools: TeamCreate/Delete, Task/Message extraction, TeammateIdle, TaskCompleted
 *
 * Activity handlers (PreToolUse, PermissionRequest, Stop, PreCompact, etc.)
 * and auto-registration logic are kept here since they're tightly coupled
 * to the event dispatch flow and shared state.
 */

import { StateManager } from '../state';
import { detectGitWorktree, detectGitStatus, clearGitStatusCache } from '../parser';
import { execFile } from 'child_process';
import { promisify } from 'util';

import type {
  HookEvent,
  PreToolUseEvent,
  PostToolUseEvent,
  PermissionRequestEvent,
  SubagentStartEvent,
  SubagentStopEvent,
  SessionStartEvent,
  TeammateIdleEvent,
  TaskCompletedEvent,
  UserPromptSubmitEvent,
  PendingSpawn,
} from './types';

import { describeToolAction } from './describeAction';
import { handleSubagentStart, handleSubagentStop, cleanPendingSpawns } from './subagents';
import {
  extractMessage,
  extractTeamCreate,
  extractTeamDelete,
  extractTaskCreate,
  extractTaskUpdate,
  handleTeammateIdle,
  handleTaskCompleted,
} from './teamTools';

const execFileAsync = promisify(execFile);

/**
 * Create a HookHandler that processes Claude Code lifecycle events
 * and updates the StateManager.
 */
export function createHookHandler(stateManager: StateManager) {
  /** Track sessions whose git info has already been detected from cwd */
  const gitInfoDetected = new Set<string>();

  /** Track cwd per session for git status refreshes */
  const sessionCwd = new Map<string, string>();

  /**
   * Track pending Task tool calls so we can associate SubagentStart
   * events with their description/prompt. Keyed by tool_use_id for
   * precise correlation when multiple subagents spawn simultaneously.
   */
  const pendingTaskSpawns = new Map<string, PendingSpawn>();

  function handleEvent(event: HookEvent) {
    const sessionId = event.session_id;
    if (!sessionId) {
      console.warn('[hooks] Event missing session_id:', event.hook_event_name);
      return;
    }

    // Update session activity timestamp and mark hooks as actively providing data
    stateManager.updateSessionActivity(sessionId);
    stateManager.markHookActive(sessionId);

    // Store cwd for later git status refreshes
    if (event.cwd && !sessionCwd.has(sessionId)) {
      sessionCwd.set(sessionId, event.cwd);
    }

    // Auto-register agent if hooks fire for a session with no agent in the registry.
    // This handles cases where context continuation changes the session ID, so the
    // JSONL watcher hasn't detected it yet but hooks are already providing events.
    // Skip for SubagentStart/SubagentStop — those have their own registration flow.
    if (event.hook_event_name !== 'SubagentStart' && event.hook_event_name !== 'SubagentStop') {
      const existingAgent = stateManager.getAgentById(sessionId);
      if (!existingAgent) {
        const session = stateManager.getSessions().get(sessionId);
        if (session) {
          // Session exists but agent is missing — create from session metadata
          const agentName = session.slug || session.projectName || sessionId.slice(0, 8);
          const agent = {
            id: sessionId,
            name: agentName,
            role: 'implementer' as const,
            status: 'working' as const,
            tasksCompleted: 0,
          };
          stateManager.registerAgent(agent);
          stateManager.updateAgent(agent);
          console.log(`[hooks] Auto-registered agent for existing session: ${sessionId.slice(0, 8)} name="${agentName}"`);
        } else if (event.cwd) {
          // Session unknown — create both session and agent from cwd
          const projectPath = event.cwd;
          const projectName = projectPath.split('/').pop() || 'unknown';
          const newSession = {
            sessionId,
            slug: projectName,
            projectPath,
            projectName,
            isTeam: false,
            lastActivity: Date.now(),
          };
          const agent = {
            id: sessionId,
            name: projectName,
            role: 'implementer' as const,
            status: 'working' as const,
            tasksCompleted: 0,
          };
          stateManager.registerAgent(agent);
          stateManager.addSession(newSession);
          console.log(`[hooks] Auto-registered session+agent from cwd: ${sessionId.slice(0, 8)} project="${projectName}"`);
        }
      }
    }

    // Detect git branch/worktree/status from cwd on first event for this session
    if (event.cwd && !gitInfoDetected.has(sessionId)) {
      gitInfoDetected.add(sessionId);
      const cwd = event.cwd;
      Promise.all([
        detectGitWorktree(cwd, execFileAsync),
        detectGitStatus(cwd, execFileAsync),
      ]).then(([gitInfo, gitStatus]) => {
        if (gitInfo.gitBranch || gitInfo.gitWorktree || gitStatus.hasUpstream) {
          stateManager.updateAgentGitInfo(sessionId, gitInfo.gitBranch, gitInfo.gitWorktree, gitStatus);
        }
      }).catch(() => { /* ignore */ });
    }

    switch (event.hook_event_name) {
      case 'PreToolUse':
        handlePreToolUse(event as PreToolUseEvent, sessionId);
        break;
      case 'PostToolUse':
        handlePostToolUse(event as PostToolUseEvent, sessionId);
        break;
      case 'PermissionRequest':
        handlePermissionRequest(event as PermissionRequestEvent, sessionId);
        break;
      case 'SubagentStart':
        handleSubagentStart(stateManager, event as SubagentStartEvent, sessionId, pendingTaskSpawns);
        break;
      case 'SubagentStop':
        handleSubagentStop(stateManager, event as SubagentStopEvent, sessionId);
        break;
      case 'PreCompact':
        handlePreCompact(sessionId);
        break;
      case 'Stop':
        handleStop(sessionId);
        break;
      case 'SessionStart':
        handleSessionStart(event as SessionStartEvent, sessionId);
        break;
      case 'SessionEnd':
        handleSessionEnd(sessionId);
        break;
      case 'TeammateIdle':
        handleTeammateIdle(stateManager, event as TeammateIdleEvent, sessionId);
        break;
      case 'TaskCompleted':
        handleTaskCompleted(stateManager, event as TaskCompletedEvent, sessionId);
        break;
      case 'UserPromptSubmit':
        handleUserPromptSubmit(event as UserPromptSubmitEvent, sessionId);
        break;
      default:
        console.log(`[hooks] Unhandled event: ${event.hook_event_name} session=${sessionId.slice(0, 8)}`);
        break;
    }
  }

  function handlePreToolUse(event: PreToolUseEvent, sessionId: string) {
    const { action, context } = describeToolAction(event.tool_name, event.tool_input);

    // Agent is actively working — clear any stopped flag so JSONL watcher can update
    stateManager.clearSessionStopped(sessionId);

    // Track Task tool spawns for subagent correlation
    if (event.tool_name === 'Task' && event.tool_use_id && event.tool_input) {
      cleanPendingSpawns(pendingTaskSpawns);
      const teamName = typeof event.tool_input.team_name === 'string'
        ? event.tool_input.team_name : undefined;
      pendingTaskSpawns.set(event.tool_use_id, {
        description: typeof event.tool_input.description === 'string'
          ? event.tool_input.description : '',
        prompt: typeof event.tool_input.prompt === 'string'
          ? (event.tool_input.prompt as string).split('\n')[0].slice(0, 80) : '',
        subagentType: typeof event.tool_input.subagent_type === 'string'
          ? event.tool_input.subagent_type : 'general-purpose',
        sessionId,
        timestamp: Date.now(),
        teamName,
      });
    }

    // Update agent activity — clear any waiting state, show working
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', action, context);
  }

  function handlePostToolUse(event: PostToolUseEvent, sessionId: string) {
    // Tool finished — clear waiting state
    stateManager.setAgentWaitingById(sessionId, false);

    // Refresh git status after git-related Bash commands
    if (event.tool_name === 'Bash' && event.tool_input) {
      const cmd = typeof event.tool_input.command === 'string' ? event.tool_input.command : '';
      if (/git\s+(push|commit|pull|merge|rebase|checkout|switch)|gh\s+pr/.test(cmd)) {
        const cwd = sessionCwd.get(sessionId);
        if (cwd) {
          clearGitStatusCache(cwd);
          detectGitStatus(cwd, execFileAsync).then((gitStatus) => {
            stateManager.updateAgentGitInfo(sessionId, undefined, undefined, gitStatus);
          }).catch(() => { /* ignore */ });
        }
      }
    }

    // Extract rich data from team coordination tools
    if (event.tool_input) {
      switch (event.tool_name) {
        case 'SendMessage':
        case 'SendMessageTool':
          extractMessage(stateManager, event, sessionId);
          break;
        case 'TeamCreate':
          extractTeamCreate(stateManager, event, sessionId);
          break;
        case 'TeamDelete':
          extractTeamDelete(stateManager, sessionId);
          break;
        case 'TaskCreate':
          extractTaskCreate(stateManager, event, sessionId);
          break;
        case 'TaskUpdate':
          extractTaskUpdate(stateManager, event, sessionId);
          break;
      }
    }
  }

  function handlePermissionRequest(event: PermissionRequestEvent, sessionId: string) {
    const { action, context } = describeToolAction(event.tool_name, event.tool_input);
    stateManager.setAgentWaitingById(sessionId, true, action, context);
  }

  function handlePreCompact(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', 'Compacting conversation...');
    console.log(`[hooks] PreCompact: ${sessionId.slice(0, 8)}`);
  }

  function handleStop(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'idle');
    stateManager.markSessionStopped(sessionId);
    console.log(`[hooks] Stop: ${sessionId.slice(0, 8)}`);
  }

  function handleSessionStart(event: SessionStartEvent, sessionId: string) {
    console.log(`[hooks] SessionStart: ${sessionId.slice(0, 8)} source=${event.source} model=${event.model}`);
  }

  function handleSessionEnd(sessionId: string) {
    console.log(`[hooks] SessionEnd: ${sessionId.slice(0, 8)}`);
    stateManager.updateAgentActivityById(sessionId, 'idle');
  }

  function handleUserPromptSubmit(event: UserPromptSubmitEvent, sessionId: string) {
    stateManager.clearSessionStopped(sessionId);
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', 'Processing prompt...');
    console.log(`[hooks] UserPromptSubmit: ${sessionId.slice(0, 8)}`);
  }

  return { handleEvent };
}
