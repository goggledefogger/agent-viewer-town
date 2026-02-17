import { describe, it, expect } from 'vitest';
import { validateHookEvent } from '../validation';

describe('validateHookEvent', () => {
  it('accepts valid PreToolUse event', () => {
    const event = {
      hook_event_name: 'PreToolUse',
      session_id: 'test-session',
      cwd: '/tmp',
      tool_name: 'test',
    };
    expect(validateHookEvent(event)).toBe(null);
  });

  it('rejects null event', () => {
    const result = validateHookEvent(null);
    expect(result).toBe('Event must be a non-null object');
  });

  it('rejects missing hook_event_name', () => {
    expect(validateHookEvent({})).toBe('Missing or invalid hook_event_name');
  });

  it('rejects unknown hook_event_name', () => {
    expect(validateHookEvent({ hook_event_name: 'InvalidName' })).toBe('Unknown hook_event_name: InvalidName');
  });

  it('rejects non-string session_id', () => {
    expect(validateHookEvent({ hook_event_name: 'PreToolUse', session_id: 123 })).toBe('session_id must be a string');
  });

  it('rejects non-string cwd', () => {
    expect(validateHookEvent({ hook_event_name: 'PreToolUse', cwd: {} })).toBe('cwd must be a string');
  });
});
