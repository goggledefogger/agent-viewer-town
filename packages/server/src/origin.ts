export function isValidOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true; // Allow non-browser clients (like Claude hooks)
  }
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
