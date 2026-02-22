import express from 'express';
import { createServer, type IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { StateManager } from './state';
import { startWatcher } from './watcher';
import { createHookHandler } from './hooks';
import { validateHookEvent } from './validation';
import { authenticate, extractToken, validateToken } from './auth';

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

// Apply authentication middleware to all subsequent routes
app.use(authenticate);

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

    const validationError = validateHookEvent(event);
    if (validationError) {
      console.warn('[hooks] Invalid event rejected:', validationError);
      res.status(400).json({ ok: false, error: validationError });
      return;
    }

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

/** Get the effective active session ID for a client (their selection, or the server default) */
function getClientActiveSessionId(ws: WebSocket): string | undefined {
  return clientStates.get(ws)?.selectedSessionId || stateManager.getDefaultSessionId();
}

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  const token = extractToken(req);
  if (!validateToken(token)) {
    console.warn(`[ws] Unauthorized connection attempt from ${req.socket.remoteAddress}`);
    ws.close(1008, 'Unauthorized');
    return;
  }

  console.log('[ws] client connected');
  // Pick the most interesting session for this new client, rather than using
  // the global default (which may be stale from a previous client's navigation).
  const activeId = stateManager.getMostInterestingSessionId() || stateManager.getDefaultSessionId();
  clientStates.set(ws, { selectedSessionId: activeId });
  ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
  ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
  ws.send(JSON.stringify({ type: 'sessions_grouped', data: stateManager.getGroupedSessionsList(activeId) }));

  // Subscribe to state changes — send per-client filtered views
  const unsubscribe = stateManager.subscribe((msg) => {
    if (ws.readyState !== WebSocket.OPEN) return;

    const client = clientStates.get(ws);
    const clientSessionId = client?.selectedSessionId;

    if (msg.type === 'full_state') {
      // Full state reset: send complete per-client filtered view
      const id = getClientActiveSessionId(ws);
      ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
      ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
      ws.send(JSON.stringify({ type: 'sessions_grouped', data: stateManager.getGroupedSessionsList(id) }));
    } else if (msg.type === 'sessions_update' || msg.type === 'sessions_list' || msg.type === 'sessions_grouped') {
      // Sessions list changed (agent status transition, session added/removed).
      // Only update navigation tree — do NOT send full_state here.
      // Agent data is already kept current via agent_update messages.
      const id = getClientActiveSessionId(ws);
      ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
      ws.send(JSON.stringify({ type: 'sessions_grouped', data: stateManager.getGroupedSessionsList(id) }));
    } else if (msg.type === 'session_started' || msg.type === 'session_ended') {
      // Session lifecycle events go to all clients, plus updated list
      const id = getClientActiveSessionId(ws);
      ws.send(JSON.stringify(msg));
      ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
      ws.send(JSON.stringify({ type: 'sessions_grouped', data: stateManager.getGroupedSessionsList(id) }));
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
        const id = getClientActiveSessionId(ws);
        ws.send(JSON.stringify({ type: 'full_state', data: getClientState(ws) }));
        ws.send(JSON.stringify({ type: 'sessions_list', data: getClientSessionsList(ws) }));
        ws.send(JSON.stringify({ type: 'sessions_grouped', data: stateManager.getGroupedSessionsList(id) }));
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
