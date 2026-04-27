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
 * Validates a cross-platform absolute path, blocking traversal, null bytes,
 * and dangerous shell metacharacters.
 */
export function isSafePath(p: string): boolean {
  if (typeof p !== 'string') return false;

  // Block null bytes
  if (p.includes('\0')) return false;

  // Block path traversal
  if (p.includes('..')) return false;

  // Block dangerous shell metacharacters
  if (/[;&|$><*?!\n\r]/.test(p)) return false;

  // Must be an absolute path (POSIX or Windows)
  const isPosixAbsolute = p.startsWith('/');
  const isWindowsAbsolute = /^[a-zA-Z]:[\\/]/.test(p);

  if (!isPosixAbsolute && !isWindowsAbsolute) return false;

  return true;
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
    if (!isSafePath(event.cwd)) {
      return 'cwd must be a safe absolute path';
    }
  }

  return null;
}
