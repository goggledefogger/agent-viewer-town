import cors from 'cors';

const ALLOWED_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function isOriginAllowed(origin: string | undefined): boolean {
  // If no origin is provided (e.g., non-browser clients like curl or local scripts), allow it
  if (!origin) {
    return true;
  }
  return ALLOWED_ORIGIN_REGEX.test(origin);
}

export const configureCors = cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
});
