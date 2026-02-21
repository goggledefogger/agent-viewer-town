/**
 * Validation logic for hook events.
 * Extracted to a separate module to allow unit testing without side effects.
 */

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
 * Validates a hook event object.
 * Returns an error message string if invalid, or null if valid.
 */
export function validateHookEvent(event: any): string | null {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return 'Event must be a JSON object';
  }

  if (typeof event.hook_event_name !== 'string') {
    return 'hook_event_name is required and must be a string';
  }

  if (!VALID_HOOK_EVENTS.has(event.hook_event_name)) {
    return `Unknown hook_event_name: ${event.hook_event_name}`;
  }

  if (event.session_id !== undefined && typeof event.session_id !== 'string') {
    return 'session_id must be a string';
  }

  if (event.cwd !== undefined && typeof event.cwd !== 'string') {
    return 'cwd must be a string';
  }

  return null;
}
