import { URL } from 'url';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedOrigin(origin?: string): boolean {
  // Allow requests with no origin (e.g. curl, automated scripts)
  if (origin === undefined) {
    return true;
  }

  // Explicitly reject the "null" origin to prevent bypasses
  if (origin === 'null') {
    return false;
  }

  try {
    const url = new URL(origin);
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    // If it's an invalid URL, reject it
    return false;
  }
}
