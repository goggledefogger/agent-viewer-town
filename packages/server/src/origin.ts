export function validateOrigin(origin: string | undefined): boolean {
  // Allow requests without origin (e.g. from curl, CLI scripts, or our local hooks)
  if (!origin) {
    return true;
  }

  // Allow only localhost and 127.0.0.1 origins
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return true;
    }
  } catch {
    // Invalid URL format
    return false;
  }

  return false;
}
