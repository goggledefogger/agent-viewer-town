import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from './state';
import { startWatcher } from './watcher';
import { createHookHandler } from './hooks';

const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();
const server = createServer(app);

// Security headers
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// JSON body parsing for hook events
app.use(express.json({ limit: '1mb' }));

// State snapshot endpoint
const stateManager = new StateManager();
const hookHandler = createHookHandler(stateManager);

app.get('/api/state', (_req, res) => {
  res.json(stateManager.getState());
});

// Hook event endpoint — receives events from Claude Code lifecycle hooks
app.post('/api/hook', (req, res) => {
  try {
    const event = req.body;
    if (event && typeof event === 'object' && event.hook_event_name) {
      hookHandler.handleEvent(event);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.warn('[hooks] Error processing event:', err instanceof Error ? err.message : err);
    res.status(200).json({ ok: true }); // Always 200 to not block Claude
  }
});

// Sessions list endpoint
app.get('/api/sessions', (_req, res) => {
  res.json(stateManager.getSessionsList());
});

// WebSocket server — per-client session tracking for multi-tab support
const wss = new WebSocketServer({ server, path: '/ws' });

/** Per-client state: tracks which session each WebSocket client has selected */
interface ClientState {
  selectedSessionId?: string;
}
const clientStates = new Map<WebSocket, ClientState>();

/** Get the filtered state for a specific client based on their session selection */
function getClientState(ws: WebSocket) {
  const client = clientStates.get(ws);
  const sessionId = client?.selectedSessionId || stateManager.getDefaultSessionId();
  if (sessionId) {
    return stateManager.getStateForSession(sessionId);
  }
  return stateManager.getState();
}

/** Get the sessions list for a specific client (marks their selected session as active) */
function getClientSessionsList(ws: WebSocket) {
  const client = clientStates.get(ws);
  return stateManager.getSessionsList(client?.selectedSessionId);
}

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] client connected');
  clientStates.set(ws, {});

  // Send current state and sessions list on connect
  ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
  ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));

  // Subscribe to state changes — send per-client filtered views
  const unsubscribe = stateManager.subscribe((msg) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const client = clientStates.get(ws);
    const clientSessionId = client?.selectedSessionId;

    if (msg.type === 'full_state' || msg.type === 'sessions_list') {
      // For full_state and sessions_list, always send the client-specific view
      ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
      ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
    } else if (msg.type === 'session_started' || msg.type === 'session_ended') {
      // Session lifecycle events go to all clients, plus updated list
      ws.send(JSON.stringify(msg));
      ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
      // If client has no explicit selection, a new auto-selected session may change their view
      if (!clientSessionId) {
        ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
      }
    } else if (msg.type === 'agent_removed') {
      // Removal events always forwarded — agent is already gone from state
      ws.send(JSON.stringify(msg));
    } else if (msg.type === 'agent_update' || msg.type === 'agent_added') {
      // Agent events: only forward if the agent belongs to this client's selected session
      const filteredState = getClientState(ws);
      const agentInView = filteredState.agents.some((a) => a.id === msg.data.id);
      if (agentInView) {
        ws.send(JSON.stringify(msg));
      }
    } else {
      // task_update, new_message — forward to all clients
      ws.send(JSON.stringify(msg));
    }
  });

  // Handle incoming messages from clients
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'select_session' && typeof msg.sessionId === 'string') {
        console.log(`[ws] Client selected session: ${msg.sessionId}`);
        // Store per-client selection — does NOT mutate global state
        const client = clientStates.get(ws);
        if (client) {
          client.selectedSessionId = msg.sessionId;
        }
        // Send filtered state to only this client
        ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
        ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    console.log('[ws] client disconnected');
    clientStates.delete(ws);
    unsubscribe();
  });

  ws.on('error', () => {
    clientStates.delete(ws);
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[server] WebSocket on ws://127.0.0.1:${PORT}/ws`);
});
