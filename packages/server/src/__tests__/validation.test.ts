import { describe, it, expect } from 'vitest';
import { validateHookEvent } from '../validation';

describe('validateHookEvent', () => {
  it('accepts valid hook event', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'valid.session-id_123',
      cwd: '/absolute/path/to/project',
    });
    expect(error).toBeNull();
  });

  it('rejects missing hook_event_name', () => {
    const error = validateHookEvent({
      session_id: '123',
    });
    expect(error).toBe('hook_event_name is required and must be a string');
  });

  it('rejects unknown hook_event_name', () => {
    const error = validateHookEvent({
      hook_event_name: 'UnknownEvent',
      session_id: '123',
    });
    expect(error).toContain('Unknown hook_event_name');
  });

  it('rejects non-string session_id', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 123,
    });
    expect(error).toBe('session_id must be a string');
  });

  it('rejects session_id with invalid characters', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'invalid/session', // forward slash not allowed
    });
    expect(error).toContain('session_id contains invalid characters');
  });

  it('rejects too long session_id', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: 'a'.repeat(129),
    });
    expect(error).toBe('session_id must be 128 characters or less');
  });

  it('rejects non-absolute cwd', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: '123',
      cwd: 'relative/path',
    });
    expect(error).toBe('cwd must be an absolute path');
  });

  it('rejects too long cwd', () => {
    const error = validateHookEvent({
      hook_event_name: 'SessionStart',
      session_id: '123',
      cwd: '/' + 'a'.repeat(1024),
    });
    expect(error).toBe('cwd must be 1024 characters or less');
  });
});
