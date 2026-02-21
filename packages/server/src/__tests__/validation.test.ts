import { describe, it, expect } from 'vitest';
import { validateHookEvent, VALID_HOOK_EVENTS } from '../validation';

describe('validateHookEvent', () => {
  it('returns null for valid events', () => {
    for (const eventName of VALID_HOOK_EVENTS) {
      const event = {
        hook_event_name: eventName,
        session_id: 'session-123',
        cwd: '/path/to/project',
      };
      expect(validateHookEvent(event)).toBeNull();
    }
  });

  it('rejects null or non-object events', () => {
    expect(validateHookEvent(null)).toBe('Event must be a JSON object');
    expect(validateHookEvent(undefined)).toBe('Event must be a JSON object');
    expect(validateHookEvent('string')).toBe('Event must be a JSON object');
    expect(validateHookEvent(123)).toBe('Event must be a JSON object');
  });

  it('requires hook_event_name as a string', () => {
    expect(validateHookEvent({})).toBe('hook_event_name is required and must be a string');
    expect(validateHookEvent({ hook_event_name: 123 })).toBe('hook_event_name is required and must be a string');
  });

  it('rejects unknown hook_event_name', () => {
    expect(validateHookEvent({ hook_event_name: 'UnknownEvent' })).toBe('Unknown hook_event_name: UnknownEvent');
  });

  describe('session_id validation', () => {
    it('rejects non-string session_id', () => {
      const event = { hook_event_name: 'SessionStart', session_id: 123 };
      expect(validateHookEvent(event)).toBe('session_id must be a string');
    });

    it('rejects too long session_id', () => {
      const event = {
        hook_event_name: 'SessionStart',
        session_id: 'a'.repeat(129),
      };
      expect(validateHookEvent(event)).toBe('session_id is too long (max 128 characters)');
    });

    it('rejects invalid characters in session_id', () => {
      const event = {
        hook_event_name: 'SessionStart',
        session_id: 'session@123',
      };
      expect(validateHookEvent(event)).toBe('session_id contains invalid characters');
    });

    it('allows valid session_id', () => {
      const event = {
        hook_event_name: 'SessionStart',
        session_id: 'session.123_abc-ABC',
      };
      expect(validateHookEvent(event)).toBeNull();
    });
  });

  describe('cwd validation', () => {
    it('rejects non-string cwd', () => {
      const event = { hook_event_name: 'SessionStart', cwd: 123 };
      expect(validateHookEvent(event)).toBe('cwd must be a string');
    });

    it('rejects too long cwd', () => {
      const event = {
        hook_event_name: 'SessionStart',
        cwd: '/' + 'a'.repeat(1024),
      };
      expect(validateHookEvent(event)).toBe('cwd is too long (max 1024 characters)');
    });

    it('rejects non-absolute cwd', () => {
      const event = {
        hook_event_name: 'SessionStart',
        cwd: 'relative/path',
      };
      expect(validateHookEvent(event)).toBe('cwd must be an absolute path');
    });

    it('allows valid absolute cwd', () => {
      const event = {
        hook_event_name: 'SessionStart',
        cwd: '/absolute/path',
      };
      expect(validateHookEvent(event)).toBeNull();
    });
  });
});
