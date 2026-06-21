export function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (origin === 'null') return false; // Explicitly block 'null' origin to prevent bypass
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
