import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import path from 'path';

let serverProcess: ChildProcess;
const PORT = 3099;

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
    serverProcess.on('error', (err) => reject(err));
    setTimeout(() => reject(new Error('Server start timeout')), 10000);
  });
});

afterAll(() => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

describe('Security: CORS protection', () => {
  it('blocks cross-origin requests by default', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/state`, {
      method: 'GET',
      headers: { 'Origin': 'http://malicious.com' },
    });
    // With proper CORS it should either return 403 or lack the ACAO header
    const acao = res.headers.get('Access-Control-Allow-Origin');
    expect(acao).not.toBe('http://malicious.com');
    expect(acao).not.toBe('*');
  });
});
