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

export function isSafePath(filepath: string): string | null {
  if (filepath.includes('..')) {
    return 'cwd must not contain traversal segments';
  }
  if (filepath.includes('\0')) {
    return 'cwd must not contain null bytes';
  }
  if (/[;&|$><*?!\n\r]/.test(filepath)) {
    return 'cwd contains unsafe characters';
  }
  // Cross-platform absolute path check
  if (!filepath.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(filepath)) {
    return 'cwd must be an absolute path';
  }
  return null;
}

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
      return 'session_id is too long (max 128 chars)';
    }
    // Allow alphanumeric, dot, underscore, hyphen. No slashes or other special chars.
    if (!/^[a-zA-Z0-9._-]+$/.test(event.session_id)) {
      return 'session_id contains invalid characters';
    }
  }

  if (event.cwd !== undefined) {
    if (typeof event.cwd !== 'string') {
      return 'cwd must be a string';
    }
    if (event.cwd.length > 1024) {
      return 'cwd is too long (max 1024 chars)';
    }
    const safePathError = isSafePath(event.cwd);
    if (safePathError) {
      return safePathError;
    }
  }

  return null;
}
