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
  if (!process.env.AUTH_TOKEN) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : req.query.token) as string;

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
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const queryToken = url.searchParams.get('token');
    
    // Also check for Bearer token in headers (though browser WS API doesn't support custom headers easily)
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    
    return queryToken || headerToken || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validator for WebSocket upgrade requests.
 * Returns true if authorized, false otherwise.
 */
export function validateWebSocketAuth(req: IncomingMessage): boolean {
  const token = getTokenFromRequest(req);
  return validateToken(token);
}
