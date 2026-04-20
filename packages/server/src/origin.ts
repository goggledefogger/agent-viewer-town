import { Request, Response, NextFunction } from 'express';

export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) {
    // Allow non-browser clients (curl, automated scripts, server-to-server)
    return true;
  }

  // Explicitly block 'null' origin which can be sent by sandboxed iframes
  if (origin === 'null') {
    return false;
  }

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

export function corsOriginFn(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (isAllowedOrigin(origin)) {
    callback(null, true);
  } else {
    // Return false to omit CORS headers instead of throwing 500 error
    callback(null, false);
  }
}

export function requireValidOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Forbidden: Invalid Origin' });
    return;
  }
  next();
}

export function verifyClient(info: { origin: string }, callback: (res: boolean, code?: number, message?: string) => void) {
  if (isAllowedOrigin(info.origin)) {
    callback(true);
  } else {
    // Rejecting connection from unauthorized origins
    callback(false, 403, 'Forbidden');
  }
}
