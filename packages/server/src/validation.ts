import path from 'path';

/**
 * Allowed hook event names for validation.
 * These correspond to the lifecycle events emitted by Claude Code.
 */
export const VALID_HOOK_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'TeammateIdle',
  'TaskCompleted',
  'UserPromptSubmit',
  'Notification',
]);

/**
 * Validates a hook event object received from the /api/hook endpoint.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateHookEvent(event: any): string | null {
  if (!event || typeof event !== 'object') {
    return 'Event must be a JSON object';
  }

  if (typeof event.hook_event_name !== 'string') {
    return 'hook_event_name is required and must be a string';
  }

  if (!VALID_HOOK_EVENTS.has(event.hook_event_name)) {
    return `Unknown hook_event_name: ${event.hook_event_name}`;
  }

  if (event.session_id !== undefined) {
    if (typeof event.session_id !== 'string') {
      return 'session_id must be a string';
    }
    if (event.session_id.length > 128) {
      return 'session_id is too long (max 128 characters)';
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(event.session_id)) {
      return 'session_id contains invalid characters';
    }
  }

  if (event.cwd !== undefined) {
    if (typeof event.cwd !== 'string') {
      return 'cwd must be a string';
    }
    if (event.cwd.length > 1024) {
      return 'cwd is too long (max 1024 characters)';
    }
    if (!path.isAbsolute(event.cwd)) {
      return 'cwd must be an absolute path';
    }
  }

  return null;
}
