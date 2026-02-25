import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { requireAuth, validateWebSocketAuth } from '../auth';
import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

describe('Auth Middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('requireAuth', () => {
    it('allows access when AUTH_TOKEN is not set', () => {
      delete process.env.AUTH_TOKEN;
      const req = { headers: {}, query: {} } as unknown as Request;
      const res = {} as unknown as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('rejects request without token when AUTH_TOKEN is set', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: {}, query: {} } as unknown as Request;
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as unknown as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(status).toHaveBeenCalledWith(401);
      expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('rejects request with invalid token', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { authorization: 'Bearer wrong' }, query: {} } as unknown as Request;
      const status = vi.fn().mockReturnThis();
      const json = vi.fn();
      const res = { status, json } as unknown as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(status).toHaveBeenCalledWith(401);
    });

    it('accepts request with valid Bearer token', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { authorization: 'Bearer secret' }, query: {} } as unknown as Request;
      const res = {} as unknown as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('accepts request with valid query token', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: {}, query: { token: 'secret' } } as unknown as Request;
      const res = {} as unknown as Response;
      const next = vi.fn();

      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('validateWebSocketAuth', () => {
    it('allows connection when AUTH_TOKEN is not set', () => {
      delete process.env.AUTH_TOKEN;
      const req = { headers: {}, url: '/ws' } as unknown as IncomingMessage;
      expect(validateWebSocketAuth(req)).toBe(true);
    });

    it('rejects connection without token when AUTH_TOKEN is set', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { host: 'localhost' }, url: '/ws' } as unknown as IncomingMessage;
      expect(validateWebSocketAuth(req)).toBe(false);
    });

    it('accepts connection with valid query token', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { host: 'localhost' }, url: '/ws?token=secret' } as unknown as IncomingMessage;
      expect(validateWebSocketAuth(req)).toBe(true);
    });

    it('accepts connection with valid Authorization header', () => {
      process.env.AUTH_TOKEN = 'secret';
      const req = { headers: { host: 'localhost', authorization: 'Bearer secret' }, url: '/ws' } as unknown as IncomingMessage;
      expect(validateWebSocketAuth(req)).toBe(true);
    });
  });
});
