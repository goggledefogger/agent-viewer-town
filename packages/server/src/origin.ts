/**
 * Validates if an origin string is allowed to connect to the server.
 * This blocks Cross-Site WebSocket Hijacking (CSWSH) and unauthorized API access.
 */
export function isValidOrigin(origin: string | undefined): boolean {
  // If no origin is provided (e.g. non-browser API calls), we allow it.
  // Browsers will always send an Origin header for cross-origin requests
  // and WebSocket connections.
  if (!origin) return true;

  // Some sandboxed iframes send "null" as the origin. We strictly block it.
  if (origin === 'null') return false;

  try {
    const url = new URL(origin);

    // Only allow local connections
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    // If we can't parse it as a URL, reject it
    return false;
  }
}
