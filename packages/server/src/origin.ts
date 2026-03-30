import { Request, Response, NextFunction } from 'express';

const ALLOWED_ORIGINS = new Set([
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
]);

/**
 * Custom CORS middleware restricting access to local development environments
 */
export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Allow requests without Origin (e.g., direct API calls/curl)
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else {
    // Reject unknown origins without throwing a 500 error
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}

/**
 * WebSocket verifyClient checking the origin header
 */
export function verifyClient(info: { origin: string }, callback: (res: boolean, code?: number, message?: string) => void) {
  const origin = info.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    callback(false, 403, 'Origin not allowed');
    return;
  }
  callback(true);
}
