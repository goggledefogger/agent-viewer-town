import { Request, Response, NextFunction } from 'express';

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function getAllowedOrigins(): string[] {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim());
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

export function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;

  if (origin) {
    if (isOriginAllowed(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    } else {
      res.status(403).json({ error: 'Forbidden: Invalid Origin' });
      return;
    }
  }

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}

export function verifyWsClient(
  info: { origin: string; secure: boolean; req: any },
  cb: (res: boolean, code?: number, message?: string) => void
): void {
  const origin = info.origin || info.req.headers.origin;
  if (isOriginAllowed(origin)) {
    cb(true);
  } else {
    cb(false, 403, 'Forbidden: Invalid Origin');
  }
}
