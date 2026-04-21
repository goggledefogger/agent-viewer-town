export function isAllowedOrigin(origin: string | undefined): boolean {
  // Allow requests without an Origin header (e.g. non-browser clients)
  if (origin === undefined) return true;

  // Block sandboxed iframes explicitly
  if (origin === 'null') return false;

  try {
    const url = new URL(origin);
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}
