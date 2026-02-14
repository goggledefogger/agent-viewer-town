import { useEffect, useRef, useState, useCallback } from 'react';
import type { AgentState } from '@agent-viewer/shared';

export interface NotificationState {
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  toggle: () => void;
}

const STORAGE_KEY = 'agent-viewer-notifications-enabled';

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

export function useNotifications(agents: AgentState[]): NotificationState {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    supported ? Notification.permission : 'unsupported'
  );
  const [enabled, setEnabled] = useState(() => supported && getStoredPreference());

  // Track previous waitingForInput state per agent ID to detect transitions
  const prevWaitingRef = useRef<Map<string, boolean>>(new Map());

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

  // Detect waitingForInput transitions and fire notifications
  useEffect(() => {
    if (!enabled || !supported || Notification.permission !== 'granted') return;

    const prevMap = prevWaitingRef.current;

    for (const agent of agents) {
      const wasWaiting = prevMap.get(agent.id) || false;
      const isWaiting = agent.waitingForInput === true && agent.status !== 'idle';

      if (isWaiting && !wasWaiting && document.hidden) {
        // Transition: not waiting -> waiting, and tab is not visible.
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
      }
    }

    // Update the tracking map for next render
    const newMap = new Map<string, boolean>();
    for (const agent of agents) {
      newMap.set(agent.id, agent.waitingForInput === true && agent.status !== 'idle');
    }
    prevWaitingRef.current = newMap;
  }, [agents, enabled, supported]);

  return { enabled, permission, toggle };
}
