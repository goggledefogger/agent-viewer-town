import { IncomingMessage } from 'http';
import { URL } from 'url';

export function validateRequest(req: IncomingMessage): boolean {
  const authToken = process.env.AUTH_TOKEN;
  if (!authToken) {
    return true;
  }

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    if (token === authToken) {
      return true;
    }
  }

  // Check query parameter
  if (req.url) {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    if (token === authToken) {
      return true;
    }
  }

  return false;
}
