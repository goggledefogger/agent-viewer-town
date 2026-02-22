import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateToken, extractToken, authenticate } from '../auth';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

describe('Auth Module', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('validateToken', () => {
    it('returns true if AUTH_TOKEN is not set', () => {
      delete process.env.AUTH_TOKEN;
      expect(validateToken('anything')).toBe(true);
      expect(validateToken(undefined)).toBe(true);
    });

    it('returns true if token matches AUTH_TOKEN', () => {
      process.env.AUTH_TOKEN = 'secret123';
      expect(validateToken('secret123')).toBe(true);
    });

    it('returns false if token does not match AUTH_TOKEN', () => {
      process.env.AUTH_TOKEN = 'secret123';
      expect(validateToken('wrong')).toBe(false);
      expect(validateToken(undefined)).toBe(false);
    });
  });

  describe('extractToken', () => {
    it('extracts token from Authorization header', () => {
      const req = {
        headers: { authorization: 'Bearer mytoken' },
      } as unknown as Request;
      expect(extractToken(req)).toBe('mytoken');
    });

    it('handles Authorization header as array', () => {
      const req = {
        headers: { authorization: ['Bearer mytoken'] },
      } as unknown as Request;
      expect(extractToken(req)).toBe('mytoken');
    });

    it('extracts token from query param (Express)', () => {
      const req = {
        headers: {},
        query: { token: 'mytoken' },
      } as unknown as Request;
      expect(extractToken(req)).toBe('mytoken');
    });

    it('extracts token from URL (IncomingMessage)', () => {
      const req = {
        headers: {},
        url: '/ws?token=mytoken&other=1',
      } as unknown as IncomingMessage;
      expect(extractToken(req)).toBe('mytoken');
    });

    it('returns undefined if no token found', () => {
      const req = {
        headers: {},
        query: {},
        url: '/ws',
      } as unknown as Request;
      expect(extractToken(req)).toBeUndefined();
    });
  });

  describe('authenticate middleware', () => {
    it('calls next() if AUTH_TOKEN is not set', () => {
      delete process.env.AUTH_TOKEN;
      const req = { headers: {} } as Request;
      const res = {} as Response;
      const next = (() => {}) as NextFunction;
      let nextCalled = false;

      authenticate(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('calls next() if valid token provided', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { authorization: 'Bearer secret' } } as Request;
      const res = {} as Response;
      let nextCalled = false;

      authenticate(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(true);
    });

    it('returns 401 if invalid token provided', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = {
        headers: { authorization: 'Bearer wrong' },
        ip: '127.0.0.1'
      } as unknown as Request;

      const res = {
        status: (code: number) => {
          expect(code).toBe(401);
          return res;
        },
        json: (body: any) => {
          expect(body).toEqual({ error: 'Unauthorized' });
        }
      } as Response;

      let nextCalled = false;
      authenticate(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
    });

    it('returns 401 if no token provided', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = {
        headers: {},
        ip: '127.0.0.1'
      } as unknown as Request;

      const res = {
        status: (code: number) => {
          expect(code).toBe(401);
          return res;
        },
        json: (body: any) => {
          expect(body).toEqual({ error: 'Unauthorized' });
        }
      } as Response;

      let nextCalled = false;
      authenticate(req, res, () => { nextCalled = true; });
      expect(nextCalled).toBe(false);
    });
  });
});
