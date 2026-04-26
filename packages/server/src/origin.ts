import { CorsOptions } from 'cors';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  }
};

export const verifyClient = (info: { origin: string }, callback: (res: boolean, code?: number, message?: string) => void) => {
  const origin = info.origin;

  // Allow requests with no origin
  if (!origin) {
    return callback(true);
  }

  if (ALLOWED_ORIGINS.includes(origin)) {
    return callback(true);
  }

  return callback(false, 403, 'Forbidden by CORS');
};
