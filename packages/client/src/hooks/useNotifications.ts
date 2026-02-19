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
const BASE_TITLE = 'Agent Viewer Town';

/**
 * Cross-tab notification deduplication via BroadcastChannel.
 *
 * When multiple tabs are open, each tab independently detects waiting agents
 * and would fire its own browser notification + audio chime. The browser's
 * Notification `tag` deduplicates the popup, but the chime plays in every tab.
 *
 * We use a BroadcastChannel to announce when a notification has been fired.
 * Other tabs that receive the message within 5 seconds will skip their chime.
 */
const recentlyFiredNotifications = new Set<string>();
let notificationChannel: BroadcastChannel | null = null;
try {
  notificationChannel = new BroadcastChannel('agent-viewer-notifications');
  notificationChannel.onmessage = (e: MessageEvent) => {
    if (e.data?.type === 'notification_fired' && typeof e.data.tag === 'string') {
      recentlyFiredNotifications.add(e.data.tag);
      setTimeout(() => recentlyFiredNotifications.delete(e.data.tag), 5000);
    }
  };
} catch {
  // BroadcastChannel not supported (e.g. SSR, older browsers)
}

/**
 * Fire a browser notification and chime, deduplicating across tabs.
 * Returns true if this tab was the one that fired.
 */
function fireNotification(title: string, body: string, tag: string): boolean {
  if (recentlyFiredNotifications.has(tag)) {
    // Another tab already fired this notification — skip chime
    return false;
  }

  const notification = new Notification(title, {
    body,
    tag,
    requireInteraction: false,
  });
  notification.onclick = () => {
    window.focus();
    notification.close();
  };

  playChime();

  // Tell other tabs we handled it
  recentlyFiredNotifications.add(tag);
  setTimeout(() => recentlyFiredNotifications.delete(tag), 5000);
  try {
    notificationChannel?.postMessage({ type: 'notification_fired', tag });
  } catch {
    // Channel may be closed
  }

  return true;
}

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

  // Dynamic tab title based on current session
  const baseTitle = useMemo(() => {
    if (!session) return BASE_TITLE;
    const branchSuffix = session.gitBranch ? ` (${session.gitBranch})` : '';
    return `${session.projectName}${branchSuffix} - ${BASE_TITLE}`;
  }, [session?.projectName, session?.gitBranch]);

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
        const action = agent.currentAction || 'Waiting for approval';
        const tag = `agent-waiting-${agent.id}`;
        fireNotification(`${agent.name} needs input`, action, tag);
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
          const tag = `agent-waiting-${info.agentId}`;
          fireNotification(
            `${info.agentName} needs input`,
            `[${s.projectName}] ${info.action}`,
            tag,
          );
        }
      }
    }

    prevCrossWaitingRef.current = currentCrossWaiting;
  }, [sessions, session?.sessionId, enabled, supported]);

  // Title flash only reflects THIS tab's session (cross-session waiting is
  // shown in the navigation tree and inbox instead).
  const totalWaitingCount = waitingAgents.length;

  // Flashing tab title when agents are waiting (same-session only)
  useEffect(() => {
    if (totalWaitingCount > 0) {
      let flash = true;
      // Clear any existing interval
      if (titleIntervalRef.current) clearInterval(titleIntervalRef.current);

      titleIntervalRef.current = setInterval(() => {
        document.title = flash
          ? `[${totalWaitingCount}] Input needed - ${baseTitle}`
          : baseTitle;
        flash = !flash;
      }, 1500);
    } else {
      // Restore original title
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = baseTitle;
    }

    return () => {
      if (titleIntervalRef.current) {
        clearInterval(titleIntervalRef.current);
        titleIntervalRef.current = null;
      }
      document.title = baseTitle;
    };
  }, [totalWaitingCount, baseTitle]);

  return { enabled, permission, toggle, waitingAgents };
}
