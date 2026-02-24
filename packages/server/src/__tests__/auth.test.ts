import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateRequest } from '../auth';
import { IncomingMessage } from 'http';

describe('Auth: validateRequest', () => {
  const originalAuthToken = process.env.AUTH_TOKEN;

  beforeEach(() => {
    delete process.env.AUTH_TOKEN;
  });

  afterEach(() => {
    if (originalAuthToken) {
      process.env.AUTH_TOKEN = originalAuthToken;
    } else {
      delete process.env.AUTH_TOKEN;
    }
  });

  it('should allow access when AUTH_TOKEN is not set', () => {
    const req = {
      headers: {},
      url: '/api/state',
    } as unknown as IncomingMessage;

    expect(validateRequest(req)).toBe(true);
  });

  it('should deny access when AUTH_TOKEN is set but missing in request', () => {
    process.env.AUTH_TOKEN = 'secret-token';
    const req = {
      headers: {},
      url: '/api/state',
    } as unknown as IncomingMessage;

    expect(validateRequest(req)).toBe(false);
  });

  it('should deny access when token is incorrect', () => {
    process.env.AUTH_TOKEN = 'secret-token';
    const req = {
      headers: { authorization: 'Bearer wrong-token' },
      url: '/api/state',
    } as unknown as IncomingMessage;

    expect(validateRequest(req)).toBe(false);
  });

  it('should allow access with valid Bearer token', () => {
    process.env.AUTH_TOKEN = 'secret-token';
    const req = {
      headers: { authorization: 'Bearer secret-token' },
      url: '/api/state',
    } as unknown as IncomingMessage;

    expect(validateRequest(req)).toBe(true);
  });

  it('should allow access with valid query parameter token', () => {
    process.env.AUTH_TOKEN = 'secret-token';
    const req = {
      headers: {},
      url: '/api/state?token=secret-token',
    } as unknown as IncomingMessage;

    expect(validateRequest(req)).toBe(true);
  });

  it('should prioritize Bearer token over query param if both exist (though usually either is fine)', () => {
      // Actually our implementation checks header first, returns true if valid.
      // If header is invalid, it checks query param.
      // If header is valid, query param is ignored.

      process.env.AUTH_TOKEN = 'secret-token';
      const req = {
        headers: { authorization: 'Bearer secret-token' },
        url: '/api/state?token=wrong-token',
      } as unknown as IncomingMessage;

      expect(validateRequest(req)).toBe(true);
  });

  it('should check query param if header is invalid/missing', () => {
    process.env.AUTH_TOKEN = 'secret-token';
    const req = {
        headers: { authorization: 'Bearer wrong-token' }, // Header check fails
        url: '/api/state?token=secret-token', // Query check succeeds
    } as unknown as IncomingMessage;

    // My implementation:
    // if header match -> return true
    // else check query -> if match -> return true
    // else return false

    // So if header is present but wrong, it falls through to query param check.
    // Wait, let's verify my code logic.
    /*
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === authToken) {
        return true;
        }
    }
    // Falls through here if header is missing OR if token doesn't match
    */

    expect(validateRequest(req)).toBe(true);
  });
});
