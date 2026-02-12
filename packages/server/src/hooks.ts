/**
 * Hook event handler — processes lifecycle events from Claude Code hooks.
 *
 * Claude Code hooks provide definitive real-time signals for:
 * - Tool execution (PreToolUse, PostToolUse)
 * - Permission requests (PermissionRequest)
 * - Subagent lifecycle (SubagentStart, SubagentStop)
 * - Context compaction (PreCompact)
 * - Session lifecycle (SessionStart, SessionEnd, Stop)
 *
 * These are much more reliable than the JSONL-parsing heuristics
 * used by the file watcher.
 */

import { StateManager } from './state';
import { inferRole } from './parser';

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
  | HookEventBase;

/**
 * Describe a tool action in human-readable form.
 * Similar to parser.ts describeToolAction but works with hook event format.
 */
function describeToolAction(toolName: string, toolInput?: Record<string, unknown>): string {
  if (!toolInput) return toolName;

  switch (toolName) {
    case 'Edit':
    case 'Write':
    case 'Read': {
      const fp = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      const filename = fp.split('/').pop() || fp;
      const verb = toolName === 'Edit' ? 'Editing' : toolName === 'Write' ? 'Writing' : 'Reading';
      return filename ? `${verb} ${filename}` : toolName;
    }
    case 'Bash': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      const cmd = typeof toolInput.command === 'string' ? toolInput.command : '';
      if (desc) return desc.slice(0, 60);
      if (cmd) {
        const short = cmd.split('&&')[0].split('|')[0].trim().slice(0, 50);
        return `Running: ${short}`;
      }
      return 'Running command';
    }
    case 'Grep':
    case 'Glob': {
      const pattern = typeof toolInput.pattern === 'string' ? toolInput.pattern : '';
      return pattern ? `Searching: ${pattern.slice(0, 40)}` : 'Searching files';
    }
    case 'Task': {
      const desc = typeof toolInput.description === 'string' ? toolInput.description : '';
      return desc ? `Spawning: ${desc.slice(0, 40)}` : 'Spawning agent';
    }
    case 'TaskCreate': {
      const subj = typeof toolInput.subject === 'string' ? toolInput.subject : '';
      return subj ? `Creating task: ${subj.slice(0, 40)}` : 'Creating task';
    }
    case 'SendMessage':
    case 'SendMessageTool': {
      const to = typeof toolInput.recipient === 'string' ? toolInput.recipient : 'team';
      return `Messaging ${to}`;
    }
    case 'WebSearch': {
      const q = typeof toolInput.query === 'string' ? toolInput.query : '';
      return q ? `Searching: ${q.slice(0, 40)}` : 'Web search';
    }
    case 'WebFetch':
      return 'Fetching web page';
    default:
      return toolName;
  }
}

/**
 * Create a HookHandler that processes Claude Code lifecycle events
 * and updates the StateManager.
 */
export function createHookHandler(stateManager: StateManager) {
  /**
   * Track pending Task tool calls so we can associate SubagentStart
   * events with their description/prompt.
   */
  const pendingTaskSpawns = new Map<string, {
    description: string;
    prompt: string;
    subagentType: string;
    sessionId: string;
    timestamp: number;
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

    // Update session activity timestamp
    stateManager.updateSessionActivity(sessionId);

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
      default:
        // Unknown event type — ignore
        break;
    }
  }

  function handlePreToolUse(event: PreToolUseEvent, sessionId: string) {
    const action = describeToolAction(event.tool_name, event.tool_input);

    // Track Task tool spawns for subagent correlation
    if (event.tool_name === 'Task' && event.tool_use_id && event.tool_input) {
      cleanPendingSpawns();
      pendingTaskSpawns.set(event.tool_use_id, {
        description: typeof event.tool_input.description === 'string'
          ? event.tool_input.description : '',
        prompt: typeof event.tool_input.prompt === 'string'
          ? (event.tool_input.prompt as string).split('\n')[0].slice(0, 80) : '',
        subagentType: typeof event.tool_input.subagent_type === 'string'
          ? event.tool_input.subagent_type : 'general-purpose',
        sessionId,
        timestamp: Date.now(),
      });
    }

    // Update agent activity — clear any waiting state, show working
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', action);
  }

  function handlePostToolUse(event: PostToolUseEvent, sessionId: string) {
    // Tool finished — clear waiting state, keep the agent working
    // (the next PreToolUse or thinking state will update the action)
    stateManager.setAgentWaitingById(sessionId, false);
  }

  function handlePermissionRequest(event: PermissionRequestEvent, sessionId: string) {
    // DEFINITIVE signal: Claude needs user input for tool approval
    const toolDesc = describeToolAction(event.tool_name, event.tool_input);
    stateManager.setAgentWaitingById(sessionId, true, toolDesc);
  }

  function handleSubagentStart(event: SubagentStartEvent, sessionId: string) {
    const agentId = event.agent_id;

    // Try to find the description from a pending Task spawn
    let name = event.agent_type || 'subagent';
    let role: 'implementer' | 'researcher' | 'planner' = 'implementer';

    // Search pending spawns for a match (use most recent one from this session)
    let bestMatch: { description: string; prompt: string; subagentType: string } | undefined;
    for (const [, spawn] of pendingTaskSpawns) {
      if (spawn.sessionId === sessionId) {
        bestMatch = spawn;
      }
    }
    if (bestMatch) {
      name = bestMatch.description || bestMatch.prompt || name;
      role = inferRole(bestMatch.subagentType, name) as typeof role;
    }

    // Register and display the subagent
    const subagent = {
      id: agentId,
      name,
      role,
      status: 'working' as const,
      tasksCompleted: 0,
      isSubagent: true,
      parentAgentId: sessionId,
    };
    stateManager.registerAgent(subagent);
    stateManager.updateAgent(subagent);

    console.log(`[hooks] SubagentStart: ${agentId} parent=${sessionId.slice(0, 8)} name="${name}" type=${event.agent_type}`);
  }

  function handleSubagentStop(event: SubagentStopEvent, sessionId: string) {
    const agentId = event.agent_id;
    const agent = stateManager.getAgentById(agentId);
    if (agent) {
      stateManager.updateAgentActivityById(agentId, 'done', 'Done');
    }
    console.log(`[hooks] SubagentStop: ${agentId} parent=${sessionId.slice(0, 8)}`);

    // Schedule removal after 2 minutes (let user see the "done" state)
    setTimeout(() => {
      stateManager.removeAgent(agentId);
    }, 120_000);
  }

  function handlePreCompact(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'working', 'Compacting conversation...');
    console.log(`[hooks] PreCompact: ${sessionId.slice(0, 8)}`);
  }

  function handleStop(sessionId: string) {
    stateManager.setAgentWaitingById(sessionId, false);
    stateManager.updateAgentActivityById(sessionId, 'idle');
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

  return { handleEvent };
}
