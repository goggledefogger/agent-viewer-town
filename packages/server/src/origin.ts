export function isAllowedOrigin(origin?: string): boolean {
  if (origin === 'null') return false;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
