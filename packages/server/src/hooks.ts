/**
 * Hook event handler — processes lifecycle events from Claude Code hooks.
 *
 * Claude Code hooks provide definitive real-time signals for:
 * - Tool execution (PreToolUse, PostToolUse)
 * - Permission requests (PermissionRequest)
 * - Subagent lifecycle (SubagentStart, SubagentStop)
 * - Context compaction (PreCompact)
 * - Session lifecycle (SessionStart, SessionEnd, Stop)
 * - Team events (TeammateIdle, TaskCompleted, UserPromptSubmit)
 * - Team coordination (TeamCreate, TeamDelete, SendMessage, TaskCreate/Update via PostToolUse)
 *
 * These are much more reliable than the JSONL-parsing heuristics
 * used by the file watcher.
 */

import { StateManager } from './state';
import { inferRole, detectGitWorktree, detectGitStatus, clearGitStatusCache } from './parser';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Common fields present in all hook events */
interface HookEventBase {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name: string;
}

interface PreToolUseEvent extends HookEventBase {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

interface PostToolUseEvent extends HookEventBase {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
}

interface PermissionRequestEvent extends HookEventBase {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

interface SubagentStartEvent extends HookEventBase {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type?: string;
}

interface SubagentStopEvent extends HookEventBase {
  hook_event_name: 'SubagentStop';
  agent_id: string;
  agent_type?: string;
  agent_transcript_path?: string;
}

interface PreCompactEvent extends HookEventBase {
  hook_event_name: 'PreCompact';
  trigger?: string;
}

interface StopEvent extends HookEventBase {
  hook_event_name: 'Stop';
  stop_hook_active?: boolean;
}

interface SessionStartEvent extends HookEventBase {
  hook_event_name: 'SessionStart';
  source?: string;
  model?: string;
}

interface SessionEndEvent extends HookEventBase {
  hook_event_name: 'SessionEnd';
  reason?: string;
}

interface TeammateIdleEvent extends HookEventBase {
  hook_event_name: 'TeammateIdle';
  teammate_name?: string;
  team_name?: string;
}

interface TaskCompletedEvent extends HookEventBase {
  hook_event_name: 'TaskCompleted';
  task_id?: string;
  task_subject?: string;
  task_description?: string;
  teammate_name?: string;
  team_name?: string;
}

interface UserPromptSubmitEvent extends HookEventBase {
  hook_event_name: 'UserPromptSubmit';
  prompt?: string;
}

type HookEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | PermissionRequestEvent
  | SubagentStartEvent
  | SubagentStopEvent
  | PreCompactEvent
  | StopEvent
  | SessionStartEvent
  | SessionEndEvent
  | TeammateIdleEvent
  | TaskCompletedEvent
  | UserPromptSubmitEvent
  | HookEventBase;

/**
 * Describe a tool action in human-readable form.
 * Similar to parser.ts describeToolAction but works with hook event format.
 */
interface ActionDescription {
  action: string;
  context?: string;
}

/**
 * Describe a tool action in human-readable form with optional context.
 * Returns { action, context } where context is a secondary line
 * (directory path, file filter, etc.) shown below the primary action.
 */
function describeToolAction(toolName: string, toolInput?: Record<string, unknown>): ActionDescription {
  if (!toolInput) return { action: toolName };

  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const parts = fp.split('/');
      const filename = parts.pop() || fp;
      const dir = parts.slice(-2).join('/');
      const verb = toolName === 'Edit' ? 'Editing' : toolName === 'Write' ? 'Writing' : 'Reading';
      return {
        action: filename ? `${verb} ${filename}` : toolName,
        context: dir || undefined,
      };
    }
    case 'Bash': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      const cmd = typeof toolInput.command === 'string' ? toolInput.command : '';
      if (desc) return { action: desc.slice(0, 60) };
      if (cmd) {
        const short = cmd.split('&&')[0].split('|')[0].trim().slice(0, 50);
        return { action: `Running: ${short}` };
      }
      return { action: 'Running command' };
    }
    case 'Grep':
    case 'Glob': {
      const pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : '';
      const glob = typeof toolInput.glob === 'string' ? toolInput.glob : '';
      const path = typeof toolInput.path === 'string' ? toolInput.path : '';
      const dir = path ? path.split('/').slice(-2).join('/') : undefined;
      return {
        action: pattern ? `Searching: ${pattern.slice(0, 40)}` : 'Searching files',
        context: glob ? `in ${glob}` : dir ? `in ${dir}` : undefined,
      };
    }
    case 'Task': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      const subType = typeof toolInput.subagent_type === 'string' ? toolInput.subagent_type : '';
      return {
        action: desc ? `Spawning: ${desc.slice(0, 40)}` : 'Spawning agent',
        context: subType ? `(${subType})` : undefined,
      };
    }
    case 'TaskCreate': {
      const subj = typeof toolInput.subject === 'string' ? toolInput.subject : '';
      return { action: subj ? `Creating task: ${subj.slice(0, 40)}` : 'Creating task' };
    }
    case 'TaskUpdate': {
      const taskId = typeof toolInput.taskId === 'string' ? toolInput.taskId : '';
      const status = typeof toolInput.status === 'string' ? toolInput.status : '';
      if (status) return { action: `Task #${taskId}: ${status}` };
      return { action: `Updating task #${taskId}` };
    }
    case 'TaskList':
      return { action: 'Checking task list' };
    case 'SendMessage':
    case 'SendMessageTool': {
      const msgType = typeof toolInput.type === 'string' ? toolInput.type : 'message';
      const to = typeof toolInput.recipient === 'string' ? toolInput.recipient : 'team';
      if (msgType === 'broadcast') return { action: 'Broadcasting to team' };
      if (msgType === 'shutdown_request') return { action: `Requesting ${to} shutdown` };
      return { action: `Messaging ${to}` };
    }
    case 'TeamCreate': {
      const name = typeof toolInput.team_name === 'string' ? toolInput.team_name : '';
      return { action: name ? `Creating team: ${name}` : 'Creating team' };
    }
    case 'TeamDelete':
      return { action: 'Deleting team' };
    case 'WebSearch': {
      const q = typeof toolInput.query === 'string' ? toolInput.query : '';
      return { action: q ? `Searching: ${q.slice(0, 40)}` : 'Web search' };
    }
    case 'WebFetch':
      return { action: 'Fetching web page' };
    case 'EnterPlanMode':
      return { action: 'Entering plan mode' };
    case 'ExitPlanMode':
      return { action: 'Presenting plan for approval' };
    case 'AskUserQuestion':
      return { action: 'Asking user a question' };
    default:
      return { action: toolName };
  }
}

/** Resolve an agent name from a session ID */
function resolveAgentName(stateManager: StateManager, sessionId: string): string {
  const agent = stateManager.getAgentById(sessionId);
  return agent?.name || sessionId.slice(0, 8);
}

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
  const pendingTaskSpawns = new Map<string, {
    description: string;
    prompt: string;
    subagentType: string;
    sessionId: string;
    timestamp: number;
    /** If present, this spawn is for a team member (not a subagent) */
    teamName?: string;
  }>();

  /** Clean up old pending spawns (> 60s) */
  function cleanPendingSpawns() {
    const now = Date.now();
    for (const [key, val] of pendingTaskSpawns) {
      if (now - val.timestamp > 60_000) {
        pendingTaskSpawns.delete(key);
      }
    }
  }

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

    // Detect git branch/worktree/status from cwd on first event for this session
    if (event.cwd && !gitInfoDetected.has(sessionId)) {
      gitInfoDetected.add(sessionId);
      const cwd = event.cwd;
      // Run async detection without blocking the event handler
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
        handleSubagentStart(event as SubagentStartEvent, sessionId);
        break;
      case 'SubagentStop':
        handleSubagentStop(event as SubagentStopEvent, sessionId);
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
        handleTeammateIdle(event as TeammateIdleEvent, sessionId);
        break;
      case 'TaskCompleted':
        handleTaskCompleted(event as TaskCompletedEvent, sessionId);
        break;
      case 'UserPromptSubmit':
        handleUserPromptSubmit(event as UserPromptSubmitEvent, sessionId);
        break;
      default:
        // Unknown event type — log for debugging new event types
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
      cleanPendingSpawns();
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

    // Extract rich data from specific team coordination tools
    if (event.tool_input) {
      switch (event.tool_name) {
        case 'SendMessage':
        case 'SendMessageTool':
          extractMessage(event, sessionId);
          break;
        case 'TeamCreate':
          extractTeamCreate(event, sessionId);
          break;
        case 'TeamDelete':
          extractTeamDelete(sessionId);
          break;
        case 'TaskCreate':
          extractTaskCreate(event, sessionId);
          break;
        case 'TaskUpdate':
          extractTaskUpdate(event, sessionId);
          break;
      }
    }
  }

  /** Extract SendMessage data and add to message log */
  function extractMessage(event: PostToolUseEvent, sessionId: string) {
    const input = event.tool_input;
    if (!input) return;

    const msgType = typeof input.type === 'string' ? input.type : 'message';
    const content = typeof input.content === 'string' ? input.content : '';
    const recipient = typeof input.recipient === 'string' ? input.recipient : '';
    const summary = typeof input.summary === 'string' ? input.summary : '';

    if (!content && !summary) return;

    const fromName = resolveAgentName(stateManager, sessionId);

    if (msgType === 'broadcast') {
      // Broadcast — show as message to "team"
      stateManager.addMessage({
        id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
        from: fromName,
        to: 'team (broadcast)',
        content: summary || content.slice(0, 200),
        timestamp: Date.now(),
      });
    } else if (msgType === 'shutdown_request') {
      stateManager.addMessage({
        id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
        from: fromName,
        to: recipient,
        content: `Shutdown request: ${content || 'wrapping up'}`,
        timestamp: Date.now(),
      });
    } else if (msgType === 'message' && recipient) {
      stateManager.addMessage({
        id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
        from: fromName,
        to: recipient,
        content: summary || content.slice(0, 200),
        timestamp: Date.now(),
      });
    }
  }

  /** Extract TeamCreate data and register team immediately */
  function extractTeamCreate(event: PostToolUseEvent, sessionId: string) {
    const input = event.tool_input;
    const response = event.tool_response;
    if (!input) return;

    const teamName = typeof input.team_name === 'string' ? input.team_name : '';
    if (!teamName) return;

    console.log(`[hooks] TeamCreate detected: ${teamName} session=${sessionId.slice(0, 8)}`);
    stateManager.setTeamName(teamName);

    // If response contains member info, register agents
    if (response && typeof response === 'object') {
      const members = Array.isArray((response as Record<string, unknown>).members)
        ? (response as Record<string, unknown>).members as Array<Record<string, string>>
        : [];
      for (const member of members) {
        const name = member.name || member.agent_id || 'unknown';
        const role = inferRole(member.agent_type || '', name);
        stateManager.registerAgent({
          id: member.agent_id || name,
          name,
          role: role as 'lead' | 'researcher' | 'implementer' | 'tester' | 'planner',
          status: 'idle',
          tasksCompleted: 0,
        });
        stateManager.updateAgent({
          id: member.agent_id || name,
          name,
          role: role as 'lead' | 'researcher' | 'implementer' | 'tester' | 'planner',
          status: 'idle',
          tasksCompleted: 0,
        });
      }
    }

    // Add a system message about team creation
    stateManager.addMessage({
      id: `hook-team-${Date.now()}`,
      from: 'system',
      to: 'all',
      content: `Team "${teamName}" created`,
      timestamp: Date.now(),
    });
  }

  /** Handle TeamDelete — clear team state */
  function extractTeamDelete(sessionId: string) {
    console.log(`[hooks] TeamDelete detected: session=${sessionId.slice(0, 8)}`);
    stateManager.clearTeamAgents();
    stateManager.addMessage({
      id: `hook-team-${Date.now()}`,
      from: 'system',
      to: 'all',
      content: 'Team deleted',
      timestamp: Date.now(),
    });
  }

  /** Extract TaskCreate data for immediate task tracking */
  function extractTaskCreate(event: PostToolUseEvent, sessionId: string) {
    const input = event.tool_input;
    const response = event.tool_response;
    if (!input) return;

    const subject = typeof input.subject === 'string' ? input.subject : '';
    const description = typeof input.description === 'string' ? input.description : '';

    // Try to get the task ID from the response
    let taskId = '';
    if (response && typeof response === 'object') {
      // Response format: "Task #N created successfully: subject"
      const resStr = typeof (response as Record<string, unknown>).result === 'string'
        ? (response as Record<string, unknown>).result as string
        : JSON.stringify(response);
      const match = resStr.match(/Task #(\d+)/);
      if (match) taskId = match[1];
    }
    if (!taskId) taskId = `hook-${Date.now()}`;

    console.log(`[hooks] TaskCreate: #${taskId} "${subject}" session=${sessionId.slice(0, 8)}`);

    stateManager.updateTask({
      id: taskId,
      subject: subject || description.slice(0, 60) || 'Untitled task',
      status: 'pending',
      owner: undefined,
      blockedBy: [],
      blocks: [],
    });
  }

  /** Extract TaskUpdate data for immediate status tracking */
  function extractTaskUpdate(event: PostToolUseEvent, sessionId: string) {
    const input = event.tool_input;
    if (!input) return;

    const taskId = typeof input.taskId === 'string' ? input.taskId : '';
    if (!taskId) return;

    const status = typeof input.status === 'string' ? input.status : undefined;
    const owner = typeof input.owner === 'string' ? input.owner : undefined;

    // Find existing task and merge updates
    const existing = stateManager.getState().tasks.find(t => t.id === taskId);
    if (existing) {
      const updated = { ...existing };
      if (status === 'pending' || status === 'in_progress' || status === 'completed') {
        updated.status = status;
      }
      if (owner !== undefined) {
        updated.owner = owner;
      }
      if (status === 'deleted') {
        stateManager.removeTask(taskId);
        console.log(`[hooks] TaskUpdate: #${taskId} deleted session=${sessionId.slice(0, 8)}`);
        return;
      }
      stateManager.updateTask(updated);
      console.log(`[hooks] TaskUpdate: #${taskId} → ${status || 'updated'} owner=${owner || existing.owner || 'none'} session=${sessionId.slice(0, 8)}`);

      // Track currentTaskId on the owning agent
      const taskOwner = updated.owner || existing.owner;
      if (taskOwner) {
        const agent = stateManager.getState().agents.find(a => a.name === taskOwner);
        if (agent) {
          if (updated.status === 'in_progress') {
            stateManager.setAgentCurrentTask(agent.id, taskId);
          } else if (updated.status === 'completed' || updated.status === 'pending') {
            // Clear currentTaskId if the agent's current task was this one
            if (agent.currentTaskId === taskId) {
              stateManager.setAgentCurrentTask(agent.id, undefined);
            }
          }
        }
      }
    }

    stateManager.reconcileAgentStatuses();
  }

  function handlePermissionRequest(event: PermissionRequestEvent, sessionId: string) {
    // DEFINITIVE signal: Claude needs user input for tool approval
    const { action, context } = describeToolAction(event.tool_name, event.tool_input);
    stateManager.setAgentWaitingById(sessionId, true, action, context);
  }

  function handleSubagentStart(event: SubagentStartEvent, sessionId: string) {
    const agentId = event.agent_id;

    // Try to find the description from a pending Task spawn
    let name = event.agent_type || 'subagent';
    let role: 'implementer' | 'researcher' | 'planner' = 'implementer';
    let teamName: string | undefined;

    // Find the oldest pending spawn from this session (FIFO order) and consume it.
    // This correctly handles simultaneous subagent spawns: each SubagentStart
    // consumes the earliest unused Task tool call from the same session.
    let bestKey: string | undefined;
    let bestTimestamp = Infinity;
    for (const [key, spawn] of pendingTaskSpawns) {
      if (spawn.sessionId === sessionId && spawn.timestamp < bestTimestamp) {
        bestKey = key;
        bestTimestamp = spawn.timestamp;
      }
    }
    if (bestKey) {
      const bestMatch = pendingTaskSpawns.get(bestKey)!;
      name = bestMatch.description || bestMatch.prompt || name;
      role = inferRole(bestMatch.subagentType, name) as typeof role;
      teamName = bestMatch.teamName;
      // Consume this spawn entry so the next SubagentStart gets a different one
      pendingTaskSpawns.delete(bestKey);
    }

    // If the spawn had a team_name, this is a team member — not a subagent.
    // Team members are top-level agents that participate in the team workflow.
    const isTeamMember = !!teamName;

    // Register and display the agent
    const agent = {
      id: agentId,
      name,
      role,
      status: 'working' as const,
      tasksCompleted: 0,
      isSubagent: !isTeamMember,
      parentAgentId: isTeamMember ? undefined : sessionId,
      teamName,
    };
    stateManager.registerAgent(agent);
    stateManager.updateAgent(agent);

    console.log(`[hooks] SubagentStart: ${agentId} parent=${sessionId.slice(0, 8)} name="${name}" type=${event.agent_type} team=${teamName || 'none'}`);
  }

  function handleSubagentStop(event: SubagentStopEvent, sessionId: string) {
    const agentId = event.agent_id;
    const agent = stateManager.getAgentById(agentId);
    if (agent) {
      // Team members transition to idle (they persist); subagents transition to done
      if (agent.teamName) {
        stateManager.updateAgentActivityById(agentId, 'idle');
      } else {
        stateManager.updateAgentActivityById(agentId, 'done', 'Done');
      }
    }
    console.log(`[hooks] SubagentStop: ${agentId} parent=${sessionId.slice(0, 8)}`);

    // Only schedule removal for subagents (not team members)
    // Brief delay so user can see the done checkmark before removal
    if (!agent?.teamName) {
      setTimeout(() => {
        stateManager.removeAgent(agentId);
      }, 15_000);
    }
  }

  function handlePreCompact(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', 'Compacting conversation...');
    console.log(`[hooks] PreCompact: ${sessionId.slice(0, 8)}`);
  }

  function handleStop(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'idle');
    // Prevent the JSONL watcher from overriding this idle state.
    // The watcher may process trailing JSONL lines (from before the Stop)
    // after this hook fires, which would incorrectly set the agent back to working.
    stateManager.markSessionStopped(sessionId);
    console.log(`[hooks] Stop: ${sessionId.slice(0, 8)}`);
  }

  function handleSessionStart(event: SessionStartEvent, sessionId: string) {
    console.log(`[hooks] SessionStart: ${sessionId.slice(0, 8)} source=${event.source} model=${event.model}`);
    // Session detection is already handled by the file watcher.
    // Hooks just provide faster activity updates.
  }

  function handleSessionEnd(sessionId: string) {
    console.log(`[hooks] SessionEnd: ${sessionId.slice(0, 8)}`);
    stateManager.updateAgentActivityById(sessionId, 'idle');
  }

  function handleTeammateIdle(event: TeammateIdleEvent, sessionId: string) {
    const teammateName = event.teammate_name;
    const teamName = event.team_name;
    console.log(`[hooks] TeammateIdle: ${teammateName || sessionId.slice(0, 8)} team=${teamName || 'unknown'}`);

    // Mark the teammate as idle
    if (teammateName) {
      stateManager.updateAgentActivity(teammateName, 'idle');
      stateManager.setAgentWaiting(teammateName, false);
    } else {
      stateManager.updateAgentActivityById(sessionId, 'idle');
      stateManager.setAgentWaitingById(sessionId, false);
    }
  }

  function handleTaskCompleted(event: TaskCompletedEvent, sessionId: string) {
    const taskId = event.task_id;
    const taskSubject = event.task_subject;
    const teammateName = event.teammate_name;
    console.log(`[hooks] TaskCompleted: #${taskId} "${taskSubject}" by ${teammateName || sessionId.slice(0, 8)}`);

    // Update the task status if we're tracking it
    if (taskId) {
      const existing = stateManager.getState().tasks.find(t => t.id === taskId);
      if (existing) {
        stateManager.updateTask({
          ...existing,
          status: 'completed',
          owner: teammateName || existing.owner,
        });
      }
    }

    // Increment tasksCompleted for the agent
    if (teammateName) {
      const agents = stateManager.getState().agents;
      const agent = agents.find(a => a.name === teammateName);
      if (agent) {
        agent.tasksCompleted += 1;
        stateManager.updateAgent(agent);
      }
    }

    stateManager.reconcileAgentStatuses();
  }

  function handleUserPromptSubmit(event: UserPromptSubmitEvent, sessionId: string) {
    // User submitted a prompt — agent is about to start working
    stateManager.clearSessionStopped(sessionId);
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', 'Processing prompt...');
    console.log(`[hooks] UserPromptSubmit: ${sessionId.slice(0, 8)}`);
  }

  return { handleEvent };
}
