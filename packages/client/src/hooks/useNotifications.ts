import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { AgentState, SessionInfo, SessionListEntry } from '@agent-viewer/shared';

export interface NotificationState {
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  toggle: () => void;
  /** Agents currently waiting for user input */
  waitingAgents: AgentState[];
}

const STORAGE_KEY = 'agent-viewer-notifications-enabled';
const ORIGINAL_TITLE = 'Agent Viewer Town';

function getStoredPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function setStoredPreference(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, String(enabled));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Generate a short notification chime using the Web Audio API.
 * Two quick tones: C5 (523 Hz) then E5 (659 Hz), each 80ms.
 */
function playChime() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    function tone(freq: number, start: number, duration: number) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    }

    tone(523, now, 0.08);       // C5
    tone(659, now + 0.1, 0.08); // E5

    // Clean up context after sounds finish
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio not available
  }
}

export function useNotifications(agents: AgentState[], session?: SessionInfo, sessions?: SessionListEntry[]): NotificationState {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported'
  );
  const [enabled, setEnabled] = useState(() => supported && getStoredPreference());

  // Track previous waitingForInput state per agent ID to detect transitions
  const prevWaitingRef = useRef<Map<string, boolean>>(new Map());
  // Track previous cross-session waiting state to detect transitions
  const prevCrossWaitingRef = useRef<Set<string>>(new Set());
  // Tab title flash interval ref
  const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggle = useCallback(() => {
    if (!supported) return;

    if (!enabled) {
      // Turning on: request permission if needed
      if (Notification.permission === 'default') {
        Notification.requestPermission().then((result) => {
          setPermission(result);
          if (result === 'granted') {
            setEnabled(true);
            setStoredPreference(true);
          }
        });
      } else if (Notification.permission === 'granted') {
        setEnabled(true);
        setStoredPreference(true);
      }
      // If denied, we can't enable
    } else {
      // Turning off
      setEnabled(false);
      setStoredPreference(false);
    }
  }, [enabled, supported]);

  // Compute currently waiting agents
  const waitingAgents = useMemo(
    () => agents.filter((a) => a.waitingForInput === true && a.status !== 'idle'),
    [agents]
  );

  // Detect waitingForInput transitions and fire notifications
  useEffect(() => {
    if (!enabled || !supported || Notification.permission !== 'granted') return;

    const prevMap = prevWaitingRef.current;

    for (const agent of agents) {
      const wasWaiting = prevMap.get(agent.id) || false;
      const isWaiting = agent.waitingForInput === true && agent.status !== 'idle';

      if (isWaiting && !wasWaiting) {
        // Fire browser notification regardless of tab visibility
        const action = agent.currentAction || 'Waiting for approval';
        const notification = new Notification(`${agent.name} needs input`, {
          body: action,
          tag: `agent-waiting-${agent.id}`,
          requireInteraction: false,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        // Play audio chime
        playChime();
      }
    }

    // Update the tracking map for next render
    const newMap = new Map<string, boolean>();
    for (const agent of agents) {
      newMap.set(agent.id, agent.waitingForInput === true && agent.status !== 'idle');
    }
    prevWaitingRef.current = newMap;
  }, [agents, enabled, supported]);

  // Detect cross-session waiting transitions (agents in OTHER sessions)
  // and fire browser notification + chime, same as same-session agents.
  useEffect(() => {
    if (!enabled || !supported || Notification.permission !== 'granted') return;
    if (!sessions) return;

    const currentSessionId = session?.sessionId;
    const currentCrossWaiting = new Set<string>();

    for (const s of sessions) {
      if (s.sessionId === currentSessionId) continue; // handled by same-session effect
      if (s.hasWaitingAgent && s.waitingAgentInfo) {
        const key = `${s.sessionId}:${s.waitingAgentInfo.agentId}`;
        currentCrossWaiting.add(key);

        if (!prevCrossWaitingRef.current.has(key)) {
          const info = s.waitingAgentInfo;
          const notification = new Notification(`${info.agentName} needs input`, {
            body: `[${s.projectName}] ${info.action}`,
            tag: `agent-waiting-${info.agentId}`,
            requireInteraction: false,
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
          playChime();
        }
      }
    }

    prevCrossWaitingRef.current = currentCrossWaiting;
  }, [sessions, session?.sessionId, enabled, supported]);

  // Count cross-session waiting agents for title flash
  const crossSessionWaitingCount = useMemo(() => {
    if (!sessions || !session) return 0;
    return sessions.filter((s) => s.sessionId !== session.sessionId && s.hasWaitingAgent).length;
  }, [sessions, session]);

  const totalWaitingCount = waitingAgents.length + crossSessionWaitingCount;

  // Flashing tab title when agents are waiting (same-session + cross-session)
  useEffect(() => {
    if (totalWaitingCount > 0) {
      let flash = true;
      // Clear any existing interval
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);

      titleIntervalRef.current = setInterval(() => {
        document.title = flash
          ? `[${totalWaitingCount}] Input needed - ${ORIGINAL_TITLE}`
          : ORIGINAL_TITLE;
        flash = !flash;
      }, 1500);
    } else {
      // Restore original title
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = ORIGINAL_TITLE;
    }

    return () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = ORIGINAL_TITLE;
    };
  }, [totalWaitingCount]);

  return { enabled, permission, toggle, waitingAgents };
}
