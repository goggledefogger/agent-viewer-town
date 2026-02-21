import { describe, it, expect } from 'vitest';
import { validateHookEvent } from '../validation';

describe('validateHookEvent', () => {
  it('accepts valid hook event', () => {
    const event = {
      hook_event_name: 'SessionStart',
      session_id: 'test-session',
      cwd: '/path/to/project'
    };
    expect(validateHookEvent(event)).toBeNull();
  });

  it('rejects null or non-object', () => {
    expect(validateHookEvent(null)).toBe('Event must be a JSON object');
    expect(validateHookEvent('not an object')).toBe('Event must be a JSON object');
    expect(validateHookEvent([])).toBe('Event must be a JSON object');
  });

  it('rejects missing hook_event_name', () => {
    const event = { session_id: 'test-session' };
    expect(validateHookEvent(event)).toBe('hook_event_name is required and must be a string');
  });

  it('rejects non-string hook_event_name', () => {
    const event = { hook_event_name: 123 };
    expect(validateHookEvent(event)).toBe('hook_event_name is required and must be a string');
  });

  it('rejects unknown hook_event_name', () => {
    const event = { hook_event_name: 'UnknownEvent' };
    expect(validateHookEvent(event)).toBe('Unknown hook_event_name: UnknownEvent');
  });

  it('rejects non-string session_id', () => {
    const event = {
      hook_event_name: 'SessionStart',
      session_id: { malicious: 'object' }
    };
    expect(validateHookEvent(event)).toBe('session_id must be a string');
  });

  it('rejects non-string cwd', () => {
    const event = {
      hook_event_name: 'SessionStart',
      cwd: 12345
    };
    expect(validateHookEvent(event)).toBe('cwd must be a string');
  });

  it('accepts event without optional fields', () => {
    const event = { hook_event_name: 'Stop' };
    expect(validateHookEvent(event)).toBeNull();
  });

  it('rejects session_id as null', () => {
    const event = {
      hook_event_name: 'SessionStart',
      session_id: null
    };
    expect(validateHookEvent(event)).toBe('session_id must be a string');
  });

  it('rejects session_id as array', () => {
    const event = {
      hook_event_name: 'SessionStart',
      session_id: ['test-session']
    };
    expect(validateHookEvent(event)).toBe('session_id must be a string');
  });

  it('rejects cwd as object', () => {
    const event = {
      hook_event_name: 'SessionStart',
      cwd: { path: '/tmp' }
    };
    expect(validateHookEvent(event)).toBe('cwd must be a string');
  });
});
