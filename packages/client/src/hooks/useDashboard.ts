import { useState, useCallback, useRef, useMemo } from 'react';
import type { TeamState, SessionListEntry, DashboardSessionState } from '@agent-viewer/shared';
import { applyMessage } from './useWebSocket';
import type { WSMessage } from '@agent-viewer/shared';

const EMPTY_STATE: TeamState = {
  name: '',
  agents: [],
  tasks: [],
  messages: [],
};

export interface DashboardPanel {
  sessionId: string;
  /** Stable insertion order index — used for grid positioning */
  order: number;
  /** The live state for this panel's session */
  state: TeamState;
}

export interface DashboardState {
  /** Whether dashboard mode is active */
  active: boolean;
  /** Ordered list of panels (stable order, only changes on add/remove) */
  panels: DashboardPanel[];
  /** Toggle dashboard mode on/off. When turning on, subscribes to all sessions. */
  toggle: (sessions: SessionListEntry[]) => string[] | null;
  /** Add a specific session as a new panel */
  addPanel: (sessionId: string) => string[];
  /** Remove a panel by session ID */
  removePanel: (sessionId: string) => string[] | null;
  /** Handle bulk initial states from server */
  applyDashboardStates: (states: DashboardSessionState[]) => void;
  /** Handle a per-session update from the server */
  applyDashboardUpdate: (sessionId: string, inner: WSMessage) => void;
  /** Click handler: enter single-view for a panel */
  focusPanel: (sessionId: string) => void;
  /** The session ID that was focused (for App to switch to single-view) */
  focusedSessionId: string | null;
  /** Clear the focused state after App processes it */
  clearFocus: () => void;
}

/**
 * Manages the multi-view dashboard state.
 * Tracks which sessions are pinned as panels, their stable ordering,
 * and their individual TeamState snapshots.
 */
export function useDashboard(): DashboardState {
  const [active, setActive] = useState(false);
  const [panels, setPanels] = useState<DashboardPanel[]>([]);
  const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null);
  /** Monotonically increasing order counter for stable positioning */
  const nextOrder = useRef(0);

  const toggle = useCallback((sessions: SessionListEntry[]): string[] | null => {
    let result: string[] | null = null;
    setActive((prev) => {
      if (prev) {
        // Turning off — clear panels
        setPanels([]);
        nextOrder.current = 0;
        return false;
      } else {
        // Turning on — create panels for all current sessions
        const sessionIds = sessions.map((s) => s.sessionId);
        const newPanels: DashboardPanel[] = sessionIds.map((sid, i) => {
          const entry = sessions.find((s) => s.sessionId === sid);
          return {
            sessionId: sid,
            order: i,
            state: {
              name: entry?.projectName || '',
              agents: [],
              tasks: [],
              messages: [],
            },
          };
        });
        nextOrder.current = sessionIds.length;
        setPanels(newPanels);
        result = sessionIds;
        return true;
      }
    });
    return result;
  }, []);

  const addPanel = useCallback((sessionId: string): string[] => {
    let allIds: string[] = [];
    setPanels((prev) => {
      if (prev.some((p) => p.sessionId === sessionId)) {
        allIds = prev.map((p) => p.sessionId);
        return prev;
      }
      const newPanel: DashboardPanel = {
        sessionId,
        order: nextOrder.current++,
        state: EMPTY_STATE,
      };
      const updated = [...prev, newPanel];
      allIds = updated.map((p) => p.sessionId);
      return updated;
    });
    return allIds;
  }, []);

  const removePanel = useCallback((sessionId: string): string[] | null => {
    let result: string[] | null = null;
    setPanels((prev) => {
      const filtered = prev.filter((p) => p.sessionId !== sessionId);
      if (filtered.length === prev.length) return prev;
      if (filtered.length === 0) {
        setActive(false);
        nextOrder.current = 0;
        return [];
      }
      result = filtered.map((p) => p.sessionId);
      return filtered;
    });
    return result;
  }, []);

  const applyDashboardStates = useCallback((states: DashboardSessionState[]) => {
    setPanels((prev) => {
      const stateMap = new Map(states.map((s) => [s.sessionId, s.team]));
      return prev.map((panel) => {
        const newState = stateMap.get(panel.sessionId);
        if (newState) {
          return { ...panel, state: newState };
        }
        return panel;
      });
    });
  }, []);

  const applyDashboardUpdate = useCallback((sessionId: string, inner: WSMessage) => {
    setPanels((prev) => {
      const idx = prev.findIndex((p) => p.sessionId === sessionId);
      if (idx < 0) return prev;
      const panel = prev[idx];
      const newState = applyMessage(panel.state, inner);
      if (newState === panel.state) return prev;
      const updated = [...prev];
      updated[idx] = { ...panel, state: newState };
      return updated;
    });
  }, []);

  const focusPanel = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusedSessionId(null);
  }, []);

  // Sort panels by stable order for rendering
  const sortedPanels = useMemo(
    () => [...panels].sort((a, b) => a.order - b.order),
    [panels],
  );

  return {
    active,
    panels: sortedPanels,
    toggle,
    addPanel,
    removePanel,
    applyDashboardStates,
    applyDashboardUpdate,
    focusPanel,
    focusedSessionId,
    clearFocus,
  };
}
