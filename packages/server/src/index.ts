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

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] client connected');

  // Send current state on connect
  const state = stateManager.getState();
  ws.send(JSON.stringify({ type: 'full_state', data: state }));

  // Subscribe to state changes
  const unsubscribe = stateManager.subscribe((msg) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
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
