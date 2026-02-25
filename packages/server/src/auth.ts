import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';
import { URL } from 'url';

/**
 * Middleware to enforce authentication if AUTH_TOKEN is set.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authToken = process.env.AUTH_TOKEN;
  if (!authToken) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token;

  if (token !== authToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

/**
 * Validator for WebSocket upgrade requests.
 * Returns true if authorized, false otherwise.
 */
export function validateWebSocketAuth(req: IncomingMessage): boolean {
  const authToken = process.env.AUTH_TOKEN;
  if (!authToken) {
    return true;
  }

  // Parse query params from URL
  // req.url is relative, e.g., '/ws?token=xyz'
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  // Also check headers? Standard WS doesn't support custom headers well in browser API,
  // but some clients might send 'Authorization'.
  // ws library puts headers in req.headers
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  return token === authToken || headerToken === authToken;
}
