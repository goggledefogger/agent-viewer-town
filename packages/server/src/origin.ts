export function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // Allow non-browser clients (e.g. bash hooks)

  try {
    const url = new URL(origin);
    const hostname = url.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}
