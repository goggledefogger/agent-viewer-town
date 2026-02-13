import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { createServer, type Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from '../state';

let server: Server;
let wss: WebSocketServer;
let stateManager: StateManager;
const PORT = 3099; // Use a non-conflicting port for tests

beforeAll(async () => {
  const app = express();
  stateManager = new StateManager();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/state', (_req, res) => {
    res.json(stateManager.getState());
  });

  server = createServer(app);
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    const state = stateManager.getState();
    ws.send(JSON.stringify({ type: 'full_state', data: state }));

    const unsubscribe = stateManager.subscribe((msg) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    });

    ws.on('close', () => unsubscribe());
    ws.on('error', () => unsubscribe());
  });

  await new Promise<void>((resolve) => {
    server.listen(PORT, resolve);
  });
});

afterAll(async () => {
  wss.close();
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe('HTTP endpoints', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTypeOf('number');
  });

  it('GET /api/state returns initial empty state', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/state`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      name: '',
      agents: [],
      tasks: [],
      messages: [],
    });
  });
});

describe('WebSocket', () => {
  it('receives full_state on connect', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    const msg = await new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    const parsed = JSON.parse(msg);
    expect(parsed.type).toBe('full_state');
    expect(parsed.data).toBeDefined();
    expect(parsed.data.agents).toEqual([]);

    ws.close();
  });

  it('receives agent_update when state changes', async () => {
    // Set up agents directly so broadcast doesn't require an active session
    stateManager.setAgents([{
      id: 'agent-1',
      name: 'test-coder',
      role: 'implementer',
      status: 'idle',
      tasksCompleted: 0,
    }]);

    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    // Wait for initial full_state
    await new Promise<void>((resolve, reject) => {
      ws.on('message', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    // Now trigger a state change via updateAgent (agent already in display list)
    const updatePromise = new Promise<string>((resolve, reject) => {
      ws.on('message', (data) => resolve(data.toString()));
      setTimeout(() => reject(new Error('timeout')), 3000);
    });

    stateManager.updateAgent({
      id: 'agent-1',
      name: 'test-coder',
      role: 'implementer',
      status: 'working',
      tasksCompleted: 0,
    });

    const msg = JSON.parse(await updatePromise);
    expect(msg.type).toBe('agent_update');
    expect(msg.data.name).toBe('test-coder');
    expect(msg.data.status).toBe('working');

    ws.close();
  });
});

describe('StateManager', () => {
  it('tracks tasks and increments agent completions', () => {
    const sm = new StateManager();
    sm.setAgents([{
      id: 'a1',
      name: 'worker',
      role: 'implementer',
      status: 'working',
      tasksCompleted: 0,
    }]);

    sm.updateTask({
      id: 't1',
      subject: 'Do stuff',
      status: 'in_progress',
      owner: 'worker',
      blockedBy: [],
      blocks: [],
    });

    // Complete the task
    sm.updateTask({
      id: 't1',
      subject: 'Do stuff',
      status: 'completed',
      owner: 'worker',
      blockedBy: [],
      blocks: [],
    });

    const state = sm.getState();
    const agent = state.agents.find((a) => a.name === 'worker');
    expect(agent!.tasksCompleted).toBe(1);
  });

  it('caps messages at maxMessages', () => {
    const sm = new StateManager();
    for (let i = 0; i < 250; i++) {
      sm.addMessage({
        id: `m${i}`,
        from: 'a',
        to: 'b',
        content: `msg ${i}`,
        timestamp: Date.now(),
      });
    }
    expect(sm.getState().messages.length).toBeLessThanOrEqual(200);
  });

  it('reset clears everything', () => {
    const sm = new StateManager();
    sm.setTeamName('test-team');
    sm.setAgents([{ id: 'a1', name: 'x', role: 'lead', status: 'idle', tasksCompleted: 0 }]);
    sm.reset();

    const state = sm.getState();
    expect(state.name).toBe('');
    expect(state.agents).toEqual([]);
    expect(state.tasks).toEqual([]);
    expect(state.messages).toEqual([]);
  });
});
