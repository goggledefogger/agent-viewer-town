import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess;
const PORT = 3098;

beforeAll(async () => {
  const serverDir = path.resolve(__dirname, '../../');

  // Spawn the actual server process using tsx
  // We use 'npx tsx' to ensure we use the local tsx version
  serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: serverDir,
    env: { ...process.env, PORT: PORT.toString() },
    stdio: 'pipe',
  });

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      const msg = data.toString();
      // console.log('Server stdout:', msg);
      if (msg.includes('listening on')) {
        serverProcess.stdout?.off('data', onData);
        resolve();
      }
    };
    serverProcess.stdout?.on('data', onData);

    serverProcess.stderr?.on('data', (data) => {
      console.error('Server stderr:', data.toString());
    });

    serverProcess.on('error', (err) => {
      reject(err);
    });

    // Fallback timeout
    setTimeout(() => reject(new Error('Server start timeout')), 10000);
  });
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

describe('Security: /api/hook Input Validation', () => {
  it('accepts valid hook event', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: 'test-session-valid',
        source: 'test'
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it('rejects event with missing hook_event_name', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: 'test-session-missing-event',
      }),
    });
    // Currently (before fix) returns 200. Test expects 400.
    expect(res.status).toBe(400);
  });

  it('rejects event with non-string session_id', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: { malicious: 'object' },
      }),
    });
    // Currently (before fix) likely returns 200 or 500. Test expects 400.
    expect(res.status).toBe(400);
  });

  it('rejects event with non-string cwd', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'PreToolUse',
        session_id: 'test-session-cwd',
        cwd: 12345, // Number instead of string
        tool_name: 'ls'
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects event with unknown hook_event_name', async () => {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook_event_name: 'UnknownEvent',
          session_id: 'test-session-unknown',
        }),
      });
      expect(res.status).toBe(400);
    });
});
