import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess;
const PORT = 3097;

beforeAll(async () => {
  const serverDir = path.resolve(__dirname, '../../');

  serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: PORT.toString() },
    stdio: 'pipe',
  });

  await new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes('listening on')) {
        serverProcess.stdout?.off('data', onData);
        resolve();
      }
    };
    serverProcess.stdout?.on('data', onData);
    serverProcess.stderr?.on('data', (data) => console.error('Server stderr:', data.toString()));
    serverProcess.on('error', reject);
    setTimeout(() => reject(new Error('Server start timeout')), 10000);
  });
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

describe('Security: Additional Input Validation', () => {
  it('rejects event with relative cwd path', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: 'test-session-relative-cwd',
        cwd: './relative/path'
      }),
    });
    // Should be 400 after fix
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('absolute');
  });

  it('rejects event with overly long session_id', async () => {
    const longId = 'a'.repeat(300);
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: longId,
      }),
    });
    // Should be 400 after fix
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('too long');
  });
});
