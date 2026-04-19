import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../origin';

describe('isAllowedOrigin', () => {
  it('allows no origin', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it('blocks null origin', () => {
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('allows localhost', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedOrigin('http://[::1]:5173')).toBe(true);
  });

  it('blocks other origins', () => {
    expect(isAllowedOrigin('http://example.com')).toBe(false);
    expect(isAllowedOrigin('http://evil.com')).toBe(false);
  });
});
