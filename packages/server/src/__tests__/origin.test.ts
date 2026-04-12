import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../origin';

describe('isAllowedOrigin', () => {
  it('allows undefined origins (non-browser)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it('allows localhost and 127.0.0.1', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isAllowedOrigin('http://[::1]:3000')).toBe(true);
  });

  it('blocks malicious origins', () => {
    expect(isAllowedOrigin('http://evil.com')).toBe(false);
    expect(isAllowedOrigin('https://example.com')).toBe(false);
  });

  it('blocks null origins', () => {
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('handles invalid URLs gracefully', () => {
    expect(isAllowedOrigin('not-a-url')).toBe(false);
  });
});
