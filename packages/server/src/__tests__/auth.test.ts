import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import { WebSocket } from 'ws';

let serverProcess: ChildProcess;
const PORT = 3099;
const TEST_TOKEN = 'secret-token-123';

beforeAll(async () => {
  const rootDir = path.resolve(__dirname, '../../../../');

  // Spawn server with AUTH_TOKEN set
  serverProcess = spawn('npx', ['tsx', 'packages/server/src/index.ts'], {
    cwd: rootDir,
    env: { ...process.env, PORT: PORT.toString(), AUTH_TOKEN: TEST_TOKEN },
    stdio: 'pipe',
  });

  // Wait for server to start
  await new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      const msg = data.toString();
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

    setTimeout(() => reject(new Error('Server start timeout')), 30000);
  });
}, 35000);

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

describe('Authentication', () => {
  it('rejects /api/state without token', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state`);
    expect(res.status).toBe(401);
  });

  it('rejects /api/state with invalid token', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state?token=wrong`);
    expect(res.status).toBe(401);
  });

  it('accepts /api/state with valid token in query', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state?token=${TEST_TOKEN}`);
    expect(res.status).toBe(200);
  });

  it('accepts /api/state with valid token in header', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status).toBe(200);
  });

  it('rejects /api/hook without token', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook_event_name: 'Stop' }),
    });
    expect(res.status).toBe(401);
  });

  it('accepts /api/hook with valid token', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/hook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      },
      body: JSON.stringify({ hook_event_name: 'Stop' }),
    });
    expect(res.status).toBe(200);
  });
});
