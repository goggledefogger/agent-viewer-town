import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import WebSocket from 'ws';

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

describe('Security: CORS and WebSocket Origin Validation', () => {
  it('allows API requests with allowed origin', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      method: 'GET',
      headers: { 'Origin': 'http://localhost:3000' },
    });
    expect(res.status).toBe(200);
  });

  it('allows API requests with no origin (curl/scripts)', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      method: 'GET',
      // omitting Origin header
    });
    expect(res.status).toBe(200);
  });

  it('rejects API requests with unauthorized origin', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      method: 'GET',
      headers: { 'Origin': 'https://malicious.com' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects API requests with null origin', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health`, {
      method: 'GET',
      headers: { 'Origin': 'null' },
    });
    expect(res.status).toBe(403);
  });

  it('allows WebSocket connection with allowed origin', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
        origin: 'http://127.0.0.1:5173'
      });
      ws.on('open', () => {
        ws.close();
        resolve();
      });
      ws.on('error', (err) => {
        reject(err);
      });
    });
  });

  it('rejects WebSocket connection with unauthorized origin', async () => {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, {
        origin: 'https://evil.com'
      });
      ws.on('error', (err: any) => {
        if (err.message.includes('403')) {
          resolve();
        } else {
          reject(err);
        }
      });
      ws.on('open', () => {
        ws.close();
        reject(new Error('Expected WebSocket to reject unauthorized origin'));
      });
    });
  });
});
