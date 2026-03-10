export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

export function checkOrigin(origin: string | undefined): boolean {
  // Allow requests with no origin (like mobile apps or curl requests)
  if (!origin) {
    return true;
  }

  return ALLOWED_ORIGINS.includes(origin);
}
