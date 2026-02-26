import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';
import { URL } from 'url';

/**
 * Validates a token against the server's configured AUTH_TOKEN.
 * If AUTH_TOKEN is not set, authentication is disabled (always returns true).
 */
export function validateToken(token?: string): boolean {
  const serverToken = process.env.AUTH_TOKEN;
  if (!serverToken) {
    return true; // Auth disabled
  }
  // Constant-time comparison could be better but strict equality is acceptable for this scope
  return token === serverToken;
}

/**
 * Express middleware to enforce authentication.
 * Checks for Bearer token in Authorization header or 'token' query parameter.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const serverToken = process.env.AUTH_TOKEN;
  if (!serverToken) {
    return next();
  }

  let token = req.query.token as string;

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (validateToken(token)) {
    next();
  } else {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}

/**
 * Extract token from WebSocket upgrade request
 */
export function getTokenFromRequest(req: IncomingMessage): string | undefined {
  if (!req.url) return undefined;

  try {
    // Parse URL relative to a dummy base since req.url is just the path
    const url = new URL(req.url, 'http://localhost');
    return url.searchParams.get('token') || undefined;
  } catch {
    return undefined;
  }
}
