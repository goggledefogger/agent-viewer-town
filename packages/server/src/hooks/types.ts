/**
 * Hook event types — lifecycle events received from Claude Code hooks.
 */

/** Common fields present in all hook events */
export interface HookEventBase {
  session_id: string;
  transcript_path?: string;
  cwd?: string;
  permission_mode?: string;
  hook_event_name: string;
}

export interface PreToolUseEvent extends HookEventBase {
  hook_event_name: 'PreToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
}

export interface PostToolUseEvent extends HookEventBase {
  hook_event_name: 'PostToolUse';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
  tool_use_id?: string;
}

export interface PermissionRequestEvent extends HookEventBase {
  hook_event_name: 'PermissionRequest';
  tool_name: string;
  tool_input?: Record<string, unknown>;
}

export interface SubagentStartEvent extends HookEventBase {
  hook_event_name: 'SubagentStart';
  agent_id: string;
  agent_type?: string;
}

export interface SubagentStopEvent extends HookEventBase {
  hook_event_name: 'SubagentStop';
  agent_id: string;
  agent_type?: string;
  agent_transcript_path?: string;
}

export interface PreCompactEvent extends HookEventBase {
  hook_event_name: 'PreCompact';
  trigger?: string;
}

export interface StopEvent extends HookEventBase {
  hook_event_name: 'Stop';
  stop_hook_active?: boolean;
}

export interface SessionStartEvent extends HookEventBase {
  hook_event_name: 'SessionStart';
  source?: string;
  model?: string;
}

export interface SessionEndEvent extends HookEventBase {
  hook_event_name: 'SessionEnd';
  reason?: string;
}

export interface TeammateIdleEvent extends HookEventBase {
  hook_event_name: 'TeammateIdle';
  teammate_name?: string;
  team_name?: string;
}

export interface TaskCompletedEvent extends HookEventBase {
  hook_event_name: 'TaskCompleted';
  task_id?: string;
  task_subject?: string;
  task_description?: string;
  teammate_name?: string;
  team_name?: string;
}

export interface UserPromptSubmitEvent extends HookEventBase {
  hook_event_name: 'UserPromptSubmit';
  prompt?: string;
}

export interface PostToolUseFailureEvent extends HookEventBase {
  hook_event_name: 'PostToolUseFailure';
  tool_name: string;
  tool_input?: Record<string, unknown>;
  tool_use_id?: string;
  error?: string;
  is_interrupt?: boolean;
}

export interface NotificationEvent extends HookEventBase {
  hook_event_name: 'Notification';
  message: string;
  title?: string;
  notification_type?: 'permission_prompt' | 'idle_prompt' | 'auth_success' | 'elicitation_dialog';
}

export type HookEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | PostToolUseFailureEvent
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
  | NotificationEvent
  | HookEventBase;

/** Pending Task tool spawn awaiting SubagentStart correlation */
export interface PendingSpawn {
  description: string;
  prompt: string;
  subagentType: string;
  sessionId: string;
  timestamp: number;
  /** If present, this spawn is for a team member (not a subagent) */
  teamName?: string;
}
