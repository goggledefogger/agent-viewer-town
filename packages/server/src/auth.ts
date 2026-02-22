import type { Request, Response, NextFunction } from 'express';
import type { IncomingMessage } from 'http';

/**
 * Validates the provided token against the configured AUTH_TOKEN environment variable.
 * If AUTH_TOKEN is not set, validation always passes (returns true).
 */
export function validateToken(token?: string): boolean {
  const expectedToken = process.env.AUTH_TOKEN;
  if (!expectedToken) {
    return true; // Auth disabled if no token configured
  }
  return token === expectedToken;
}

/**
 * Extracts token from Authorization header (Bearer) or query parameter 'token'.
 */
export function extractToken(req: Request | IncomingMessage): string | undefined {
  let token: string | undefined;

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (headerValue && headerValue.startsWith('Bearer ')) {
      token = headerValue.substring(7);
    }
  }

  if (token) return token;

  // Check query parameter
  // For Express Request, query is already parsed
  if ('query' in req) {
    const expressReq = req as Request;
    if (expressReq.query && typeof expressReq.query.token === 'string') {
      token = expressReq.query.token;
    }
  }

  // For IncomingMessage (WebSocket upgrade) or if Express query failed
  if (!token && req.url) {
    try {
      // Use dummy base for relative URLs
      const url = new URL(req.url, 'http://localhost');
      const queryToken = url.searchParams.get('token');
      if (queryToken) {
        token = queryToken;
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  return token;
}

/**
 * Express middleware to enforce authentication if AUTH_TOKEN is set.
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  const expectedToken = process.env.AUTH_TOKEN;
  if (!expectedToken) {
    return next();
  }

  const token = extractToken(req);

  if (!token || !validateToken(token)) {
    console.warn(`[auth] Unauthorized access attempt from ${req.ip}`);
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
