import { CorsOptions } from 'cors';
import { VerifyClientCallbackSync } from 'ws';

const isAllowedOrigin = (origin: string) => {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
};

export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
};

export const verifyClient: VerifyClientCallbackSync = (info) => {
  const origin = info.origin;
  if (!origin) {
    // Typically, browsers will send an origin for WebSocket requests.
    // If it's absent, we can optionally allow it, or be strict.
    // Since we're protecting against CSWSH from browsers, let's allow no-origin (for programmatic clients).
    return true;
  }
  return isAllowedOrigin(origin);
};
