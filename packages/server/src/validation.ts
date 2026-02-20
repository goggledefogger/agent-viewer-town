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

/**
 * Validates a hook event payload.
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

  // Session ID validation
  if (event.session_id !== undefined) {
    if (typeof event.session_id !== 'string') {
      return 'session_id must be a string';
    }
    // Alphanumeric, dots, underscores, hyphens only
    if (!/^[a-zA-Z0-9._-]+$/.test(event.session_id)) {
      return 'session_id contains invalid characters';
    }
    // Max length 128 characters
    if (event.session_id.length > 128) {
      return 'session_id is too long (max 128 chars)';
    }
  }

  // CWD validation
  if (event.cwd !== undefined) {
    if (typeof event.cwd !== 'string') {
      return 'cwd must be a string';
    }
    // Must be an absolute path
    if (!path.isAbsolute(event.cwd)) {
      return 'cwd must be an absolute path';
    }
    // Max length 1024 characters
    if (event.cwd.length > 1024) {
      return 'cwd is too long (max 1024 chars)';
    }
    // Prevent directory traversal attempts (though execFile resolves them, explicit denial is safer)
    // Checking for '..' segments in the path string
    if (event.cwd.split(path.sep).includes('..')) {
      return 'cwd cannot contain traversal characters';
    }
  }

  return null;
}
