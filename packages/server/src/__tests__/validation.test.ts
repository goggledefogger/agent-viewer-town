import { describe, it, expect } from 'vitest';
import { validateHookEvent } from '../validation';
import path from 'path';

describe('validateHookEvent', () => {
  const validEvent = {
    hook_event_name: 'PreToolUse',
    session_id: 'valid-session_123.ABC',
    cwd: path.resolve('/tmp/project'), // Ensures absolute path for the current OS
  };

  it('accepts a valid event', () => {
    expect(validateHookEvent(validEvent)).toBeNull();
  });

  it('rejects missing event object', () => {
    expect(validateHookEvent(null)).toBe('Event must be a JSON object');
    expect(validateHookEvent(undefined)).toBe('Event must be a JSON object');
    expect(validateHookEvent('string')).toBe('Event must be a JSON object');
  });

  it('rejects missing hook_event_name', () => {
    expect(validateHookEvent({ ...validEvent, hook_event_name: undefined })).toBe('hook_event_name is required and must be a string');
  });

  it('rejects unknown hook_event_name', () => {
    expect(validateHookEvent({ ...validEvent, hook_event_name: 'InvalidEvent' })).toContain('Unknown hook_event_name');
  });

  describe('session_id validation', () => {
    it('rejects non-string session_id', () => {
      expect(validateHookEvent({ ...validEvent, session_id: 123 })).toBe('session_id must be a string');
    });

    it('rejects session_id with invalid characters', () => {
      expect(validateHookEvent({ ...validEvent, session_id: 'bad/id' })).toBe('session_id contains invalid characters');
      expect(validateHookEvent({ ...validEvent, session_id: 'bad id' })).toBe('session_id contains invalid characters');
      expect(validateHookEvent({ ...validEvent, session_id: 'bad$id' })).toBe('session_id contains invalid characters');
    });

    it('rejects session_id that is too long', () => {
      const longId = 'a'.repeat(129);
      expect(validateHookEvent({ ...validEvent, session_id: longId })).toBe('session_id is too long (max 128 chars)');
    });

    it('accepts session_id with allowed special chars', () => {
      expect(validateHookEvent({ ...validEvent, session_id: 'valid.id-with_underscore' })).toBeNull();
    });
  });

  describe('cwd validation', () => {
    it('rejects non-string cwd', () => {
      expect(validateHookEvent({ ...validEvent, cwd: 123 })).toBe('cwd must be a string');
    });

    it('rejects relative cwd', () => {
      expect(validateHookEvent({ ...validEvent, cwd: 'relative/path' })).toBe('cwd must be an absolute path');
      expect(validateHookEvent({ ...validEvent, cwd: './relative/path' })).toBe('cwd must be an absolute path');
    });

    it('rejects cwd with traversal characters', () => {
      const traversalPath = path.resolve('/tmp/foo/../bar'); // This resolves to /tmp/bar, so it IS valid if resolved first.
      // But the input string might contain '..' explicitly if not resolved by the client.
      // We want to test the string check.
      const rawTraversalPath = '/tmp/foo/../bar';
      expect(validateHookEvent({ ...validEvent, cwd: rawTraversalPath })).toBe('cwd cannot contain traversal characters');
    });

    it('rejects cwd that is too long', () => {
      const longPath = '/' + 'a'.repeat(1024);
      expect(validateHookEvent({ ...validEvent, cwd: longPath })).toBe('cwd is too long (max 1024 chars)');
    });
  });
});
