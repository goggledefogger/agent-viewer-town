export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (origin === 'null') return false; // Prevent unauthorized bypasses from sandboxed iframes
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
