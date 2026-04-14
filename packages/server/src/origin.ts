export const ALLOWED_ORIGINS = [
  'http://localhost',
  'http://127.0.0.1',
  'http://[::1]'
];

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || origin === 'null') return false;
  try {
    const url = new URL(origin);
    // Allow localhost/127.0.0.1/[::1] with any port for local development
    return (
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}
