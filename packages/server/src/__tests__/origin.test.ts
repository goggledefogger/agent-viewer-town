import { describe, it, expect, vi } from 'vitest';
import { isAllowedOrigin, verifyClient } from '../origin';

describe('isAllowedOrigin', () => {
  it('allows localhost and loopback IPv4', () => {
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isAllowedOrigin('https://localhost')).toBe(true);
  });

  it('allows IPv6 loopback', () => {
    expect(isAllowedOrigin('http://[::1]:3000')).toBe(true);
  });

  it('rejects external origins', () => {
    expect(isAllowedOrigin('https://example.com')).toBe(false);
    expect(isAllowedOrigin('http://malicious.local:3000')).toBe(false);
  });

  it('rejects null and undefined origins', () => {
    expect(isAllowedOrigin(undefined)).toBe(false);
    expect(isAllowedOrigin('null')).toBe(false);
    expect(isAllowedOrigin('')).toBe(false);
  });

  it('rejects malformed origins gracefully', () => {
    expect(isAllowedOrigin('not-a-url')).toBe(false);
  });
});

describe('verifyClient', () => {
  it('calls callback with true for allowed origin', () => {
    const callback = vi.fn();
    verifyClient({ origin: 'http://localhost:3001', req: {} as any, secure: false }, callback);
    expect(callback).toHaveBeenCalledWith(true);
  });

  it('calls callback with false and 403 for blocked origin', () => {
    const callback = vi.fn();
    verifyClient({ origin: 'https://attacker.com', req: {} as any, secure: false }, callback);
    expect(callback).toHaveBeenCalledWith(false, 403, 'Forbidden: Unauthorized Origin');
  });

  it('calls callback with false and 403 for null origin', () => {
    const callback = vi.fn();
    verifyClient({ origin: 'null', req: {} as any, secure: false }, callback);
    expect(callback).toHaveBeenCalledWith(false, 403, 'Forbidden: Unauthorized Origin');
  });
});
