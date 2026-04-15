export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // allow same-origin requests
  if (origin === 'null') return false; // explicitly block sandboxed iframes

  try {
    const parsedOrigin = new URL(origin);
    const allowedHostnames = ['localhost', '127.0.0.1', '[::1]'];
    return allowedHostnames.includes(parsedOrigin.hostname);
  } catch {
    return false;
  }
}
