export function isAllowedOrigin(origin?: string): boolean {
  if (origin === undefined) return true;
  if (origin === 'null') return false;

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://127.0.0.1:5173', 'http://localhost:5173'];

  if (allowedOrigins.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
