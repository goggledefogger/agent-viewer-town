import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentState, InboxNotification, NotificationType, SessionInfo } from '@agent-viewer/shared';

interface InboxResult {
  activeNotifications: InboxNotification[];
  historyNotifications: InboxNotification[];
  unreadCount: number;
  highestPriority: NotificationType | null;
  markRead: (id: string) => void;
  markAllRead: () => void;
}

const PRIORITY_ORDER: Record<NotificationType, number> = {
  permission_request: 0,
  ask_user_question: 1,
  plan_approval: 2,
  agent_error: 3,
  task_completed: 4,
  agent_idle: 5,
  agent_stopped: 6,
};

function getNotificationType(agent: AgentState): NotificationType | null {
  if (!agent.waitingForInput) return null;
  const action = (agent.currentAction || '').toLowerCase();
  if (action.includes('permission') || action.includes('approve')) return 'permission_request';
  if (action.includes('question') || action.includes('ask')) return 'ask_user_question';
  if (action.includes('plan')) return 'plan_approval';
  return 'permission_request'; // default waiting = permission request
}

/** Client-side inbox: generates notifications from agent state transitions */
export function useInbox(agents: AgentState[], session?: SessionInfo): InboxResult {
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
          const type = getNotificationType(agent) || 'permission_request';
          const actionText = agent.currentAction || 'Waiting for input';
          const notif: InboxNotification = {
            id: `${agent.id}-${Date.now()}`,
            agentId: agent.id,
            agentName: agent.name,
            type,
            title: `${agent.name} needs input`,
            body: actionText,
            context: agent.actionContext,
            sessionId: session?.sessionId || 'unknown',
            projectName: session?.projectName || 'Unknown Project',
            gitBranch: agent.gitBranch || session?.gitBranch,
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
  }, [agents, session]);

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
