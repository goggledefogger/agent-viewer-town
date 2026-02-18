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
  PostToolUseFailureEvent,
  PermissionRequestEvent,
  SubagentStartEvent,
  SubagentStopEvent,
  SessionStartEvent,
  TeammateIdleEvent,
  TaskCompletedEvent,
  UserPromptSubmitEvent,
  NotificationEvent,
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

    // Resolve JSONL session UUID to team agent ID if this session belongs to a team member.
    // For solo sessions, agentId === sessionId (no mapping exists).
    const agentId = stateManager.resolveAgentId(sessionId);

    // Update session activity timestamp and mark hooks as actively providing data.
    // Session-level operations use sessionId; agent-level operations use agentId.
    stateManager.updateSessionActivity(sessionId);
    stateManager.markHookActive(agentId);

    // If this agent belongs to a team, also update the team session activity
    const resolvedAgent = stateManager.getAgentById(agentId);
    if (resolvedAgent?.teamName) {
      stateManager.updateSessionActivity(`team:${resolvedAgent.teamName}`);
    }

    // Store cwd for later git status refreshes
    if (event.cwd && !sessionCwd.has(sessionId)) {
      sessionCwd.set(sessionId, event.cwd);
    }

    // Auto-register agent if hooks fire for a session with no agent in the registry.
    // This handles cases where context continuation changes the session ID, so the
    // JSONL watcher hasn't detected it yet but hooks are already providing events.
    // Skip for SubagentStart/SubagentStop — those have their own registration flow.
    // Skip if agentId resolved to a team agent (already registered via team config).
    if (event.hook_event_name !== 'SubagentStart' && event.hook_event_name !== 'SubagentStop') {
      const existingAgent = stateManager.getAgentById(agentId);
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

    // Detect git branch/worktree/status from cwd on first event for this session.
    // Use agentId for updateAgentGitInfo so team agents get their git info.
    if (event.cwd && !gitInfoDetected.has(sessionId)) {
      gitInfoDetected.add(sessionId);
      const cwd = event.cwd;
      const gitAgentId = agentId;
      Promise.all([
        detectGitWorktree(cwd, execFileAsync),
        detectGitStatus(cwd, execFileAsync),
      ]).then(([gitInfo, gitStatus]) => {
        if (gitInfo.gitBranch || gitInfo.gitWorktree || gitStatus.hasUpstream) {
          stateManager.updateAgentGitInfo(gitAgentId, gitInfo.gitBranch, gitInfo.gitWorktree, gitStatus);
        }
      }).catch(() => { /* ignore */ });
    }

    switch (event.hook_event_name) {
      case 'PreToolUse':
        handlePreToolUse(event as PreToolUseEvent, sessionId, agentId);
        break;
      case 'PostToolUse':
        handlePostToolUse(event as PostToolUseEvent, sessionId, agentId);
        break;
      case 'PermissionRequest':
        handlePermissionRequest(event as PermissionRequestEvent, agentId);
        break;
      case 'SubagentStart':
        handleSubagentStart(stateManager, event as SubagentStartEvent, agentId, pendingTaskSpawns);
        break;
      case 'SubagentStop':
        handleSubagentStop(stateManager, event as SubagentStopEvent, agentId);
        break;
      case 'PreCompact':
        handlePreCompact(agentId);
        break;
      case 'Stop':
        handleStop(sessionId, agentId);
        break;
      case 'SessionStart':
        handleSessionStart(event as SessionStartEvent, sessionId);
        break;
      case 'SessionEnd':
        handleSessionEnd(agentId);
        break;
      case 'TeammateIdle':
        handleTeammateIdle(stateManager, event as TeammateIdleEvent, sessionId);
        break;
      case 'TaskCompleted':
        handleTaskCompleted(stateManager, event as TaskCompletedEvent, sessionId);
        break;
      case 'UserPromptSubmit':
        handleUserPromptSubmit(sessionId, agentId);
        break;
      case 'PostToolUseFailure':
        handlePostToolUseFailure(event as PostToolUseFailureEvent, agentId);
        break;
      case 'Notification':
        handleNotification(event as NotificationEvent, agentId);
        break;
      default:
        console.log(`[hooks] Unhandled event: ${event.hook_event_name} session=${sessionId.slice(0, 8)}`);
        break;
    }

    // Use permission_mode as a supplemental plan mode signal.
    // When permission_mode is "plan", the agent is in plan mode — set waiting
    // state if not already waiting for something else.
    if (event.permission_mode === 'plan') {
      const agent = stateManager.getAgentById(agentId);
      if (agent && !agent.waitingForInput) {
        stateManager.setAgentWaitingById(agentId, true, 'In plan mode', undefined, 'plan');
      }
    }
  }

  function handlePreToolUse(event: PreToolUseEvent, sessionId: string, agentId: string) {
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
    stateManager.setAgentWaitingById(agentId, false);
    stateManager.updateAgentActivityById(agentId, 'working', action, context);
  }

  function handlePostToolUse(event: PostToolUseEvent, sessionId: string, agentId: string) {
    // Tool finished — clear waiting state
    stateManager.setAgentWaitingById(agentId, false);

    // Refresh git status after git-related Bash commands
    if (event.tool_name === 'Bash' && event.tool_input) {
      const cmd = typeof event.tool_input.command === 'string' ? event.tool_input.command : '';
      if (/git\s+(push|commit|pull|merge|rebase|checkout|switch)|gh\s+pr/.test(cmd)) {
        const cwd = sessionCwd.get(sessionId);
        if (cwd) {
          clearGitStatusCache(cwd);
          detectGitStatus(cwd, execFileAsync).then((gitStatus) => {
            stateManager.updateAgentGitInfo(agentId, undefined, undefined, gitStatus);
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

  function handlePermissionRequest(event: PermissionRequestEvent, agentId: string) {
    const { action, context } = describeToolAction(event.tool_name, event.tool_input);
    stateManager.setAgentWaitingById(agentId, true, action, context, 'permission');
  }

  function handlePreCompact(agentId: string) {
    stateManager.setAgentWaitingById(agentId, false);
    stateManager.updateAgentActivityById(agentId, 'working', 'Compacting conversation...');
    console.log(`[hooks] PreCompact: ${agentId.slice(0, 8)}`);
  }

  function handleStop(sessionId: string, agentId: string) {
    stateManager.setAgentWaitingById(agentId, false);
    stateManager.updateAgentActivityById(agentId, 'idle');
    // markSessionStopped uses the raw sessionId (JSONL-level flag)
    stateManager.markSessionStopped(sessionId);
    console.log(`[hooks] Stop: session=${sessionId.slice(0, 8)} agent=${agentId.slice(0, 12)}`);
  }

  function handleSessionStart(event: SessionStartEvent, sessionId: string) {
    console.log(`[hooks] SessionStart: ${sessionId.slice(0, 8)} source=${event.source} model=${event.model}`);
  }

  function handleSessionEnd(agentId: string) {
    console.log(`[hooks] SessionEnd: ${agentId.slice(0, 12)}`);
    stateManager.updateAgentActivityById(agentId, 'idle');
  }

  function handleUserPromptSubmit(sessionId: string, agentId: string) {
    // clearSessionStopped uses the raw sessionId (JSONL-level flag)
    stateManager.clearSessionStopped(sessionId);
    stateManager.setAgentWaitingById(agentId, false);
    stateManager.updateAgentActivityById(agentId, 'working', 'Processing prompt...');
    console.log(`[hooks] UserPromptSubmit: session=${sessionId.slice(0, 8)} agent=${agentId.slice(0, 12)}`);
  }

  function handlePostToolUseFailure(event: PostToolUseFailureEvent, agentId: string) {
    // Tool failed but Claude will respond to the error — keep agent in working state.
    // Show the failure as the current action for visibility.
    const { action } = describeToolAction(event.tool_name, event.tool_input);
    const failAction = event.is_interrupt ? 'Interrupted' : `Failed: ${action}`;
    stateManager.setAgentWaitingById(agentId, false);
    stateManager.updateAgentActivityById(agentId, 'working', failAction);
  }

  function handleNotification(event: NotificationEvent, agentId: string) {
    // notification_type field is bugged and may be absent (GitHub issue #11964).
    // Match defensively on both notification_type and message text.
    const nType = event.notification_type;
    const msg = event.message || '';

    if (nType === 'idle_prompt' || msg.includes('idle') || msg.includes('waiting for input')) {
      // Claude has been idle 60+ seconds waiting for user input
      stateManager.setAgentWaitingById(agentId, true, 'Waiting for input', undefined, 'question');
      console.log(`[hooks] Notification idle_prompt: ${agentId.slice(0, 12)}`);
    } else if (nType === 'permission_prompt') {
      // Redundant with PermissionRequest but good to handle as fallback
      if (!stateManager.getAgentById(agentId)?.waitingForInput) {
        stateManager.setAgentWaitingById(agentId, true, 'Awaiting permission', undefined, 'permission');
      }
      console.log(`[hooks] Notification permission_prompt: ${agentId.slice(0, 12)}`);
    }
    // auth_success and elicitation_dialog are informational — no state change needed
  }

  return { handleEvent };
}
