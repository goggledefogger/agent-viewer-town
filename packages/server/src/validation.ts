export const VALID_HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
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
];

export function validateHookEvent(event: any): string | null {
  if (!event || typeof event !== 'object') {
    return 'Event must be a non-null object';
  }

  const hookName = event.hook_event_name;
  if (!hookName || typeof hookName !== 'string') {
    return 'Missing or invalid hook_event_name';
  }

  if (!VALID_HOOK_EVENTS.includes(hookName)) {
    return `Unknown hook_event_name: ${hookName}`;
  }

  if (event.session_id !== undefined && typeof event.session_id !== 'string') {
    return 'session_id must be a string';
  }

  if (event.cwd !== undefined && typeof event.cwd !== 'string') {
    return 'cwd must be a string';
  }

  if (typeof event.session_id === 'string' && event.session_id.length > 256) {
      return 'session_id too long';
  }

  return null; // Valid
}
