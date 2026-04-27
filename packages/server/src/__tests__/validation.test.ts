import { describe, it, expect } from 'vitest';
import { validateHookEvent, isSafePath } from '../validation';

describe('isSafePath', () => {
  it('accepts valid POSIX absolute paths', () => {
    expect(isSafePath('/absolute/path')).toBe(true);
    expect(isSafePath('/path/with-dashes/and_underscores')).toBe(true);
    expect(isSafePath('/path/with/spaces is fine')).toBe(true);
    expect(isSafePath('/path/with/(parens)/and/[brackets]')).toBe(true);
    expect(isSafePath('/~home/path')).toBe(true);
  });

  it('accepts valid Windows absolute paths', () => {
    expect(isSafePath('C:\\absolute\\path')).toBe(true);
    expect(isSafePath('D:/absolute/path/with/forward/slashes')).toBe(true);
    expect(isSafePath('Z:\\path\\with spaces')).toBe(true);
  });

  it('rejects relative paths', () => {
    expect(isSafePath('relative/path')).toBe(false);
    expect(isSafePath('./relative/path')).toBe(false);
    expect(isSafePath('dir/')).toBe(false);
  });

  it('rejects path traversal', () => {
    expect(isSafePath('/path/../path')).toBe(false);
    expect(isSafePath('C:\\path\\..\\path')).toBe(false);
    expect(isSafePath('/..')).toBe(false);
  });

  it('rejects null bytes', () => {
    expect(isSafePath('/path/with/\0/byte')).toBe(false);
  });

  it('rejects dangerous shell metacharacters', () => {
    expect(isSafePath('/path/with/;/cmd')).toBe(false);
    expect(isSafePath('/path/with/&/cmd')).toBe(false);
    expect(isSafePath('/path/with/|/cmd')).toBe(false);
    expect(isSafePath('/path/with/$/cmd')).toBe(false);
    expect(isSafePath('/path/with/>/cmd')).toBe(false);
    expect(isSafePath('/path/with/</cmd')).toBe(false);
    expect(isSafePath('/path/with/*/cmd')).toBe(false);
    expect(isSafePath('/path/with/?/cmd')).toBe(false);
    expect(isSafePath('/path/with/\n/cmd')).toBe(false);
    expect(isSafePath('/path/with/\r/cmd')).toBe(false);
  });
});

describe('validateHookEvent', () => {
  it('accepts valid input', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'valid-session-id_123.ABC-456',
      cwd: '/absolute/path/to/project',
    });
    expect(error).toBeNull();
  });

  it('accepts optional fields missing', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
    });
    expect(error).toBeNull();
  });

  it('rejects invalid hook_event_name', () => {
    const error = validateHookEvent({
      hook_event_name: 'InvalidEvent',
    });
    expect(error).toMatch(/Unknown hook_event_name/);
  });

  it('rejects missing hook_event_name', () => {
    const error = validateHookEvent({});
    expect(error).toMatch(/hook_event_name is required/);
  });

  it('rejects non-object event', () => {
    const error = validateHookEvent(null);
    expect(error).toMatch(/Event must be a JSON object/);
  });

  it('validates session_id characters', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'bad/session/id',
    });
    expect(error).toMatch(/session_id contains invalid characters/);
  });

  it('validates session_id spaces', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'session id with space',
    });
    expect(error).toMatch(/session_id contains invalid characters/);
  });

  it('validates session_id length', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'a'.repeat(129),
    });
    expect(error).toMatch(/session_id is too long/);
  });

  it('validates cwd absolute path and safety', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: 'relative/path',
    });
    expect(error).toMatch(/cwd must be a safe absolute path/);
  });

  it('validates cwd null bytes', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: '/path/with/\0/byte',
    });
    expect(error).toMatch(/cwd must be a safe absolute path/);
  });

  it('validates cwd length', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: '/' + 'a'.repeat(1025),
    });
    expect(error).toMatch(/cwd is too long/);
  });
});
