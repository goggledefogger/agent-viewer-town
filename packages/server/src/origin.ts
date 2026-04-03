import cors from 'cors';

const LOCAL_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    if (LOCAL_ORIGIN_REGEX.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
});

export const verifyClient = (info: { origin: string }, callback: (res: boolean, code?: number, message?: string) => void) => {
  const origin = info.origin;
  if (!origin) {
    return callback(true);
  }
  if (LOCAL_ORIGIN_REGEX.test(origin)) {
    return callback(true);
  }
  // Omitting the error code (e.g. 403) here to avoid a known Bun bug
  // TypeError: undefined is not an object (evaluating 'http')
  return callback(false);
};
