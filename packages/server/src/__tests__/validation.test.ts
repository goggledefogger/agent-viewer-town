import { describe, it, expect } from 'vitest';
import { validateHookEvent } from '../validation';

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

  it('validates cwd absolute path', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: 'relative/path',
    });
    expect(error).toMatch(/cwd must be an absolute path/);
  });

  it('validates cwd null bytes', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: '/path/with/\0/byte',
    });
    expect(error).toMatch(/cwd must not contain null bytes/);
  });

  it('validates cwd length', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      cwd: '/' + 'a'.repeat(1025),
    });
    expect(error).toMatch(/cwd is too long/);
  });
});
