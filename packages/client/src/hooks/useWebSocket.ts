import { useState, useEffect, useRef, useCallback } from 'react';
import type { TeamState, SessionListEntry, GroupedSessionsList, WSMessage } from '@agent-viewer/shared';

const EMPTY_STATE: TeamState = {
  name: '',
  agents: [],
  tasks: [],
  messages: [],
};

const EMPTY_GROUPED: GroupedSessionsList = {
  projects: [],
  flatSessions: [],
};

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

export interface WebSocketState {
  team: TeamState;
  sessions: SessionListEntry[];
  groupedSessions: GroupedSessionsList;
  connectionStatus: ConnectionStatus;
  selectSession: (sessionId: string) => void;
}

export function useWebSocket(url: string): WebSocketState {
  const [state, setState] = useState<TeamState>(EMPTY_STATE);
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [groupedSessions, setGroupedSessions] = useState<GroupedSessionsList>(EMPTY_GROUPED);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasConnectedOnce = useRef(false);
  const hasLockedSession = useRef(false);

  const selectSession = useCallback((sessionId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'select_session', sessionId }));
    }
  }, []);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] connected');
      setConnectionStatus('connected');
      // Only reset session lock on first connection.
      // On reconnection, keep the lock so the user stays on their chosen session.
      if (!hasConnectedOnce.current) {
        hasLockedSession.current = false;
      }
      hasConnectedOnce.current = true;
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'sessions_list':
            console.log(`[ws] sessions_list: ${msg.data.length} sessions`, msg.data.map((s: { projectName: string; active: boolean }) => `${s.projectName}(${s.active ? 'active' : ''})`));
            setSessions(msg.data);
            break;
          case 'sessions_grouped':
            setGroupedSessions(msg.data);
            break;
          case 'session_started':
            setSessions((prev) => {
              const exists = prev.some((s) => s.sessionId === msg.data.sessionId);
              if (exists) return prev;
              return [...prev, {
                sessionId: msg.data.sessionId,
                projectName: msg.data.projectName,
                projectPath: msg.data.mainRepoPath || msg.data.projectPath,
                slug: msg.data.slug,
                gitBranch: msg.data.gitBranch,
                isTeam: msg.data.isTeam,
                agentCount: msg.data.isTeam ? 0 : 1,
                lastActivity: msg.data.lastActivity,
                active: false,
                hasWaitingAgent: false,
              }];
            });
            break;
          case 'session_ended':
            setSessions((prev) => prev.filter((s) => s.sessionId !== msg.data.sessionId));
            break;
          default:
            if (msg.type === 'full_state') {
              console.log(`[ws] full_state: session=${msg.data.session?.projectName || 'none'} agents=${msg.data.agents?.length || 0}`);
              // Lock into the initial session so server auto-selections don't change our view
              if (!hasLockedSession.current && msg.data.session?.sessionId && ws.readyState === WebSocket.OPEN) {
                hasLockedSession.current = true;
                ws.send(JSON.stringify({ type: 'select_session', sessionId: msg.data.session.sessionId }));
              }
            }
            setState((prev) => applyMessage(prev, msg));
            break;
        }
      } catch (e) {
        console.error('[ws] parse error', e);
      }
    };

    ws.onclose = () => {
      console.log('[ws] disconnected, reconnecting in 2s...');
      setConnectionStatus(hasConnectedOnce.current ? 'reconnecting' : 'disconnected');
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { team: state, sessions, groupedSessions, connectionStatus, selectSession };
}

export function applyMessage(state: TeamState, msg: WSMessage): TeamState {
  switch (msg.type) {
    case 'full_state':
      return msg.data;

    case 'agent_update':
      return {
        ...state,
        agents: state.agents.map((a) =>
          a.id === msg.data.id ? msg.data : a
        ),
      };

    case 'agent_added':
      // Deduplicate: if agent already exists, treat as update
      if (state.agents.some((a) => a.id === msg.data.id)) {
        return {
          ...state,
          agents: state.agents.map((a) =>
            a.id === msg.data.id ? msg.data : a
          ),
        };
      }
      return {
        ...state,
        agents: [...state.agents, msg.data],
      };

    case 'agent_removed':
      return {
        ...state,
        agents: state.agents.filter((a) => a.id !== msg.data.id),
      };

    case 'task_update':
      return {
        ...state,
        tasks: state.tasks.some((t) => t.id === msg.data.id)
          ? state.tasks.map((t) => (t.id === msg.data.id ? msg.data : t))
          : [...state.tasks, msg.data],
      };

    case 'new_message':
      return {
        ...state,
        messages: [...state.messages, msg.data],
      };

    default:
      return state;
  }
}
