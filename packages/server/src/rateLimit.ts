import { Request, Response, NextFunction } from 'express';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

interface RateLimitInfo {
  count: number;
  resetTime: number;
}

/**
 * Simple in-memory rate limiter middleware.
 * Uses a fixed-window algorithm to track requests per IP.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, RateLimitInfo>();

  // Periodically clean up expired entries to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    for (const [ip, info] of hits.entries()) {
      if (now > info.resetTime) {
        hits.delete(ip);
      }
    }
  }, options.windowMs);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.ip || req.socket.remoteAddress || 'unknown') as string;
    const now = Date.now();

    let info = hits.get(ip);

    if (!info || now > info.resetTime) {
      info = {
        count: 0,
        resetTime: now + options.windowMs,
      };
    }

    info.count++;
    hits.set(ip, info);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', options.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, options.max - info.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime / 1000));

    if (info.count > options.max) {
      res.status(429).json({
        error: options.message || 'Too many requests, please try again later.',
      });
      return;
    }

    next();
  };
}
