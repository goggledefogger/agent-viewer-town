import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from './state';
import { startWatcher } from './watcher';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const server = createServer(app);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// State snapshot endpoint
const stateManager = new StateManager();

app.get('/api/state', (_req, res) => {
  res.json(stateManager.getState());
});

// Sessions list endpoint
app.get('/api/sessions', (_req, res) => {
  res.json(stateManager.getSessionsList());
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] client connected');

  // Send current state and sessions list on connect
  const state = stateManager.getState();
  ws.send(JSON.stringify({ type: 'full_state', data: state }));
  ws.send(JSON.stringify({ type: 'sessions_list', data: stateManager.getSessionsList() }));

  // Subscribe to state changes
  const unsubscribe = stateManager.subscribe((msg) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  });

  // Handle incoming messages from clients
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'select_session' && typeof msg.sessionId === 'string') {
        console.log(`[ws] Client selected session: ${msg.sessionId}`);
        stateManager.selectSession(msg.sessionId);
        // Send updated state to this client
        ws.send(JSON.stringify({ type: 'full_state', data: stateManager.getState() }));
        ws.send(JSON.stringify({ type: 'sessions_list', data: stateManager.getSessionsList() }));
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    console.log('[ws] client disconnected');
    unsubscribe();
  });

  ws.on('error', () => {
    unsubscribe();
  });
});

// Start file watcher
const watcher = startWatcher(stateManager);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[server] shutting down...');
  watcher.close();
  wss.close();
  server.close();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] WebSocket on ws://localhost:${PORT}/ws`);
});
