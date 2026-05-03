import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from '../origin';

describe('isAllowedOrigin', () => {
  it('denies null origin', () => {
    expect(isAllowedOrigin('null')).toBe(false);
  });

  it('allows localhost and 127.0.0.1', () => {
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
  });

  it('denies other origins', () => {
    expect(isAllowedOrigin('http://example.com')).toBe(false);
    expect(isAllowedOrigin('https://malicious.com')).toBe(false);
  });

  it('allows undefined origin (e.g. non-browser clients)', () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
  });

  it('denies invalid origins', () => {
    expect(isAllowedOrigin('invalid-url')).toBe(false);
  });
});
