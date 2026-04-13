import { URL } from 'url';
import type { VerifyClientCallbackSync, VerifyClientCallbackAsync } from 'ws';

/**
 * Validates if an origin is allowed to connect to the server.
 * Only localhost / 127.0.0.1 / [::1] are allowed to prevent Cross-Site WebSocket Hijacking (CSWSH)
 * and CSRF attacks from external sites binding to localhost.
 * Explicitly blocks 'null' origins to prevent sandboxed iframe bypasses.
 */
export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null') {
    return false;
  }

  try {
    const url = new URL(origin);
    const hostname = url.hostname;

    // Only allow local loopback interfaces
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    // If it's not a valid URL (e.g. malformed origin), reject it
    return false;
  }
}

/**
 * WebSocket verifyClient callback to ensure the connection origin is authorized.
 */
export const verifyClient: VerifyClientCallbackSync | VerifyClientCallbackAsync = (info, callback) => {
  const origin = info.origin;

  if (isAllowedOrigin(origin)) {
    callback(true);
  } else {
    console.warn(`[ws] Rejected unauthorized origin: ${origin}`);
    callback(false, 403, 'Forbidden: Unauthorized Origin');
  }
};
