import path from 'path';

// Allowed hook event names for validation
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

const SESSION_ID_REGEX = /^[a-zA-Z0-9._-]+$/;

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
      return 'session_id must be 128 characters or less';
    }
    if (!SESSION_ID_REGEX.test(event.session_id)) {
       return 'session_id contains invalid characters (allowed: alphanumeric, ., _, -)';
    }
  }

  if (event.cwd !== undefined) {
     if (typeof event.cwd !== 'string') {
      return 'cwd must be a string';
    }
    if (event.cwd.length > 1024) {
      return 'cwd must be 1024 characters or less';
    }
    if (!path.isAbsolute(event.cwd)) {
       return 'cwd must be an absolute path';
    }
  }

  return null;
}
