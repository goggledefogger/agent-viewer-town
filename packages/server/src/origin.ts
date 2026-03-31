import { Request, Response, NextFunction } from 'express';
import { IncomingMessage } from 'http';

const ALLOWED_ORIGINS = new Set(['http://localhost:3001', 'http://127.0.0.1:3001', 'http://localhost:5173', 'http://127.0.0.1:5173']);

export function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
     res.status(403).json({ error: 'Forbidden' });
     return;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
}

export function verifyClient(info: { origin: string; req: IncomingMessage }, callback: (res: boolean, code?: number, message?: string) => void) {
  const origin = info.origin;

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    callback(false, 403, 'Forbidden');
    return;
  }

  callback(true);
}
