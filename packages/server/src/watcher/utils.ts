import { access, constants } from 'fs/promises';
import type { Debouncer } from './types';

export function createDebouncer(delayMs: number): Debouncer {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  function debounce(key: string, fn: () => void) {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, delayMs)
    );
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  }

  return { debounce, clear };
}

export async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

interface NodeError extends Error {
  code: string;
}

export function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
