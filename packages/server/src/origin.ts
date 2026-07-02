export function isAllowedOrigin(origin?: string, allowedOrigins?: string[]): boolean {
  if (!origin) return true;
  if (origin === 'null') return false;

  if (allowedOrigins && allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
