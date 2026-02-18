import { stat } from 'fs/promises';
import { createReadStream } from 'fs';

export async function readNewLines(filePath: string, fromByte: number): Promise<{ lines: string[]; newOffset: number }> {
  try {
    const stats = await stat(filePath);
    if (stats.size <= fromByte) {
      // File may have been truncated/rewritten -- reset offset
      if (stats.size < fromByte) {
        return readNewLines(filePath, 0);
      }
      return { lines: [], newOffset: fromByte };
    }

    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const stream = createReadStream(filePath, { start: fromByte });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        // Only return complete lines; keep partial trailing line for next read
        const allLines = text.split('\n');
        const hasTrailingNewline = text.endsWith('\n');
        const completeLines = hasTrailingNewline ? allLines.filter((l) => l.trim()) : allLines.slice(0, -1).filter((l) => l.trim());
        const consumedBytes = hasTrailingNewline
          ? text.length
          : text.lastIndexOf('\n') + 1;

        resolve({
          lines: completeLines,
          newOffset: fromByte + consumedBytes,
        });
      });
      stream.on('error', (err) => {
        console.warn(`[parser] Error reading transcript ${filePath}:`, err instanceof Error ? err.message : String(err));
        resolve({ lines: [], newOffset: fromByte });
      });
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { lines: [], newOffset: 0 };
    }
    console.warn(`[parser] Error stat-ing transcript ${filePath}:`, err instanceof Error ? err.message : String(err));
    return { lines: [], newOffset: fromByte };
  }
}
