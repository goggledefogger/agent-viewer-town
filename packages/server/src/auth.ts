import { Request, Response, NextFunction } from 'express';

const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
  // Only warn once on startup (this module is imported once)
  console.warn('[auth] ⚠️ AUTH_TOKEN is not set. Server is running in INSECURE mode (allowing all requests).');
} else {
  console.log('[auth] 🔒 Authentication enabled.');
}

/**
 * Validates the provided token against the configured AUTH_TOKEN.
 * If no AUTH_TOKEN is configured, all tokens (even undefined) are considered valid.
 */
export function validateToken(token?: string): boolean {
  if (!AUTH_TOKEN) return true;
  return token === AUTH_TOKEN;
}

/**
 * Express middleware to enforce authentication.
 * Checks for token in 'Authorization: Bearer <token>' header or '?token=<token>' query param.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_TOKEN) {
    next();
    return;
  }

  let token: string | undefined;

  // Check query param
  if (typeof req.query.token === 'string') {
    token = req.query.token;
  }

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (!token && authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (validateToken(token)) {
    next();
  } else {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
}
