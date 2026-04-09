/**
 * Security: Origin Validation
 *
 * Ensures that connections (HTTP and WebSocket) originate from trusted local sources.
 * This mitigates Cross-Site Request Forgery (CSRF) and Cross-Site WebSocket Hijacking (CSWSH)
 * where malicious websites attempt to interact with the local server.
 */

export function isAllowedOrigin(origin?: string): boolean {
  // Allow requests without an origin (e.g., local scripts, curls, background workers)
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    // Allow only localhost, 127.0.0.1, and IPv6 localhost
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  } catch (err) {
    // If the origin cannot be parsed as a URL, reject it
    return false;
  }
}
