export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
