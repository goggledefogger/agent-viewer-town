import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentState, InboxNotification, NotificationType, SessionInfo, SessionListEntry } from '@agent-viewer/shared';

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

/** Max number of notifications to keep in the list */
const MAX_NOTIFICATIONS = 50;

function getNotificationType(agent: AgentState): NotificationType {
  if (!agent.waitingForInput) return 'permission_request';
  const action = (agent.currentAction || '').toLowerCase();
  // Check for specific waiting types in order of specificity
  if (action.includes('plan') && (action.includes('approv') || action.includes('review'))) return 'plan_approval';
  if (action.includes('question') || action.includes('ask')) return 'ask_user_question';
  if (action.includes('permission') || action.includes('approve') || action.includes('allow')) return 'permission_request';
  // Default: permission_request is the most common waiting type
  return 'permission_request';
}

/** Client-side inbox: generates notifications from agent state transitions */
export function useInbox(agents: AgentState[], session?: SessionInfo, sessions?: SessionListEntry[]): InboxResult {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const prevWaiting = useRef<Set<string>>(new Set());
  const prevSessionId = useRef<string | undefined>(undefined);

  // Reset prevWaiting ref when session changes to prevent stale IDs
  useEffect(() => {
    const currentSessionId = session?.sessionId;
    if (currentSessionId !== prevSessionId.current) {
      prevWaiting.current = new Set();
      prevSessionId.current = currentSessionId;
    }
  }, [session?.sessionId]);

  // Detect waiting-for-input transitions
  useEffect(() => {
    const currentWaiting = new Set<string>();

    for (const agent of agents) {
      if (agent.waitingForInput) {
        currentWaiting.add(agent.id);

        // New waiting agent -- create notification
        if (!prevWaiting.current.has(agent.id)) {
          const type = getNotificationType(agent);
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
          setNotifications((prev) => {
            const updated = [notif, ...prev];
            // Cap at MAX_NOTIFICATIONS, trim oldest
            if (updated.length > MAX_NOTIFICATIONS) {
              return updated.slice(0, MAX_NOTIFICATIONS);
            }
            return updated;
          });
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

  // Cross-session notification resolution: when the sessions list updates and
  // a session's hasWaitingAgent becomes false, resolve notifications for agents
  // in that session. This handles the case where the user responds to Claude Code
  // in a terminal for a session that isn't currently displayed in the viewer.
  useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    // Build a set of session IDs that still have waiting agents
    const sessionsWithWaiting = new Set(
      sessions.filter((s) => s.hasWaitingAgent).map((s) => s.sessionId)
    );

    setNotifications((prev) => {
      let changed = false;
      const updated = prev.map((n) => {
        if (!n.resolved && !sessionsWithWaiting.has(n.sessionId)) {
          changed = true;
          return { ...n, resolved: true };
        }
        return n;
      });
      return changed ? updated : prev;
    });
  }, [sessions]);

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
