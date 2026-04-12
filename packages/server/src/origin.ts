export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Allow non-browser requests
  try {
    if (origin === 'null') return false;

    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}
