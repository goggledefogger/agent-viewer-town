export function checkOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  const allowedOriginsStr = process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
  const allowedOrigins = allowedOriginsStr.split(',').map(o => o.trim());

  return allowedOrigins.includes(origin);
}

export function verifyClient(
  info: { origin: string; req: any },
  callback: (res: boolean, code?: number, message?: string) => void
) {
  if (checkOrigin(info.origin)) {
    callback(true);
  } else {
    console.warn(`[ws] Rejected connection from unauthorized origin: ${info.origin}`);
    callback(false, 403, 'Forbidden');
  }
}
