import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentState, InboxNotification, NotificationType } from '@agent-viewer/shared';

interface InboxResult {
  activeNotifications: InboxNotification[];
  historyNotifications: InboxNotification[];
  unreadCount: number;
  highestPriority: NotificationType | null;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const PRIORITY_ORDER: Record<NotificationType, number> = {
  permission: 0,
  question: 1,
  plan_review: 2,
  error: 3,
  task_completed: 4,
  idle: 5,
};

function getNotificationType(agent: AgentState): NotificationType | null {
  if (!agent.waitingForInput) return null;
  const action = (agent.currentAction || '').toLowerCase();
  if (action.includes('permission') || action.includes('approve')) return 'permission';
  if (action.includes('question') || action.includes('ask')) return 'question';
  if (action.includes('plan')) return 'plan_review';
  return 'permission'; // default waiting = permission request
}

/** Client-side inbox: generates notifications from agent state transitions */
export function useInbox(agents: AgentState[]): InboxResult {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const prevWaiting = useRef<Set<string>>(new Set());

  // Detect waiting-for-input transitions
  useEffect(() => {
    const currentWaiting = new Set<string>();

    for (const agent of agents) {
      if (agent.waitingForInput) {
        currentWaiting.add(agent.id);

        // New waiting agent — create notification
        if (!prevWaiting.current.has(agent.id)) {
          const type = getNotificationType(agent) || 'permission';
          const notif: InboxNotification = {
            id: `${agent.id}-${Date.now()}`,
            agentId: agent.id,
            agentName: agent.name,
            type,
            message: agent.currentAction || 'Waiting for input',
            timestamp: Date.now(),
            read: false,
            resolved: false,
          };
          setNotifications((prev) => [notif, ...prev]);
        }
      }
    }

    // Auto-resolve notifications for agents no longer waiting
    setNotifications((prev) =>
      prev.map((n) => {
        if (!n.resolved && !currentWaiting.has(n.agentId)) {
          return { ...n, resolved: true };
        }
        return n;
      })
    );

    prevWaiting.current = currentWaiting;
  }, [agents]);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const active = notifications.filter((n) => !n.resolved);
  const history = notifications.filter((n) => n.resolved);
  const unread = notifications.filter((n) => !n.read).length;

  const highestPriority = active.length > 0
    ? active.reduce((best, n) =>
        PRIORITY_ORDER[n.type] < PRIORITY_ORDER[best.type] ? n : best
      ).type
    : null;

  return {
    activeNotifications: active,
    historyNotifications: history,
    unreadCount: unread,
    highestPriority,
    markRead,
    markAllRead,
  };
}
