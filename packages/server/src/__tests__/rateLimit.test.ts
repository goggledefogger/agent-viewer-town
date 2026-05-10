import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../rateLimit';
import { Request, Response } from 'express';

describe('createRateLimiter', () => {
  it('allows requests within the limit', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    const req = { ip: '1.2.3.4' } as Request;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 1);

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
  });

  it('blocks requests exceeding the limit', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const req = { ip: '1.2.3.4' } as Request;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.any(String)
    }));
  });

  it('resets the limit after windowMs', async () => {
    const limiter = createRateLimiter({ windowMs: 100, max: 1 });
    const req = { ip: '1.2.3.4' } as Request;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Wait for the window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('tracks different IPs separately', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    const req1 = { ip: '1.1.1.1' } as Request;
    const req2 = { ip: '2.2.2.2' } as Request;
    const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    limiter(req1, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    limiter(req2, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalledWith(429);
  });
});
