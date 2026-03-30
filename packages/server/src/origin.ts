/**
 * Validates the Origin header for incoming HTTP and WebSocket connections.
 *
 * Since agent-viewer-town is a local developer tool running on 127.0.0.1,
 * we must ensure that any cross-origin requests from browsers are strictly
 * limited to local clients (e.g., localhost:5173, localhost:3001) to prevent
 * CSRF and Cross-Site WebSocket Hijacking (CSWSH) from malicious websites
 * running on the developer's computer.
 */
export function isValidOrigin(origin?: string): boolean {
  // If there's no origin, it's not a browser (e.g., curl from hooks)
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    // Only allow localhost and 127.0.0.1
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    // Invalid URL parsing
  }

  return false;
}
