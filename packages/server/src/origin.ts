export const LOCAL_ORIGIN_REGEX = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Validates the origin of incoming requests.
 * Allows requests without an origin (e.g., from local scripts/CLI tools)
 * and restricts browser-based requests to local origins.
 */
export function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return LOCAL_ORIGIN_REGEX.test(origin);
}
