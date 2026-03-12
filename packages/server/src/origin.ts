import cors from 'cors';

export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function checkOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Allow local tests and non-browser clients
  return ALLOWED_ORIGINS.includes(origin);
}

// Reusable CORS options that correctly reject unauthorized origins gracefully (no 500 error)
export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (checkOrigin(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
};
