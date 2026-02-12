import { useState, useEffect, useRef, useCallback } from 'react';
import type { TeamState, WSMessage } from '@agent-viewer/shared';

const EMPTY_STATE: TeamState = {
  name: '',
  agents: [],
  tasks: [],
  messages: [],
};

export function useWebSocket(url: string): TeamState {
  const [state, setState] = useState<TeamState>(EMPTY_STATE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[ws] connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        setState((prev) => applyMessage(prev, msg));
      } catch (e) {
        console.error('[ws] parse error', e);
      }
    };

    ws.onclose = () => {
      console.log('[ws] disconnected, reconnecting in 2s...');
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

  return state;
}

function applyMessage(state: TeamState, msg: WSMessage): TeamState {
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
