import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { AgentState, TaskState, InboxNotification, NotificationType } from '@agent-viewer/shared';

export type InboxPriority = 'critical' | 'high' | 'medium' | 'low';

const MAX_NOTIFICATIONS = 100;

/** Map notification type to display priority */
export function getPriority(type: NotificationType): InboxPriority {
  switch (type) {
    case 'permission_request':
    case 'ask_user_question':
    case 'plan_approval':
      return 'critical';
    case 'agent_error':
      return 'high';
    case 'task_completed':
      return 'medium';
    default:
      return 'low';
  }
}

let nextId = 1;
function makeId(): string {
  return `inbox-${nextId++}-${Date.now()}`;
}

function createNotification(
  type: NotificationType,
  agent: AgentState,
  title: string,
  body: string,
  context?: string,
): InboxNotification {
  return {
    id: makeId(),
    type,
    timestamp: Date.now(),
    title,
    body,
    context,
    agentId: agent.id,
    agentName: agent.name,
    sessionId: '',
    projectName: '',
    read: false,
    resolved: false,
  };
}

export interface UseInboxReturn {
  notifications: InboxNotification[];
  unreadCount: number;
  activeCount: number;
  highestPriority: InboxPriority | null;
  activeNotifications: InboxNotification[];
  historyNotifications: InboxNotification[];
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
}

export function useInbox(agents: AgentState[], tasks: TaskState[]): UseInboxReturn {
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);
  const prevAgentsRef = useRef<Map<string, AgentState>>(new Map());
  const prevTasksRef = useRef<Map<string, TaskState>>(new Map());

  // Track agent state changes to generate notifications
  useEffect(() => {
    const prevAgents = prevAgentsRef.current;
    const newNotifications: InboxNotification[] = [];

    for (const agent of agents) {
      const prev = prevAgents.get(agent.id);

      // Agent started waiting for input (new or changed)
      if (agent.waitingForInput && (!prev || !prev.waitingForInput)) {
        const action = agent.currentAction || 'Waiting for approval';
        newNotifications.push(
          createNotification(
            'permission_request',
            agent,
            `${agent.name} needs your input`,
            action,
            agent.actionContext,
          )
        );
      }

      // Agent stopped waiting (auto-resolve existing notifications)
      if (prev?.waitingForInput && !agent.waitingForInput) {
        setNotifications((current) =>
          current.map((n) =>
            n.agentId === agent.id &&
            !n.resolved &&
            (n.type === 'permission_request' || n.type === 'ask_user_question' || n.type === 'plan_approval')
              ? { ...n, resolved: true }
              : n
          )
        );
      }
    }

    // Update ref
    prevAgentsRef.current = new Map(agents.map((a) => [a.id, a]));

    if (newNotifications.length > 0) {
      setNotifications((current) =>
        [...newNotifications, ...current].slice(0, MAX_NOTIFICATIONS)
      );
    }
  }, [agents]);

  // Track task completions
  useEffect(() => {
    const prevTasks = prevTasksRef.current;
    const newNotifications: InboxNotification[] = [];

    for (const task of tasks) {
      const prev = prevTasks.get(task.id);
      if (task.status === 'completed' && prev && prev.status !== 'completed') {
        const ownerAgent = agents.find((a) => a.name === task.owner);
        if (ownerAgent) {
          newNotifications.push(
            createNotification(
              'task_completed',
              ownerAgent,
              `Task #${task.id} completed`,
              task.subject,
            )
          );
        }
      }
    }

    prevTasksRef.current = new Map(tasks.map((t) => [t.id, t]));

    if (newNotifications.length > 0) {
      setNotifications((current) =>
        [...newNotifications, ...current].slice(0, MAX_NOTIFICATIONS)
      );
    }
  }, [tasks, agents]);

  const markRead = useCallback((notificationId: string) => {
    setNotifications((current) =>
      current.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((current) =>
      current.map((n) => (n.read ? n : { ...n, read: true }))
    );
  }, []);

  const activeNotifications = useMemo(
    () => notifications.filter((n) => !n.resolved),
    [notifications]
  );

  const historyNotifications = useMemo(
    () => notifications.filter((n) => n.resolved),
    [notifications]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read && !n.resolved).length,
    [notifications]
  );

  const activeCount = useMemo(
    () => activeNotifications.length,
    [activeNotifications]
  );

  const highestPriority = useMemo((): InboxPriority | null => {
    if (activeNotifications.length === 0) return null;
    const priorities: InboxPriority[] = activeNotifications
      .filter((n) => !n.read)
      .map((n) => getPriority(n.type));
    if (priorities.includes('critical')) return 'critical';
    if (priorities.includes('high')) return 'high';
    if (priorities.includes('medium')) return 'medium';
    if (priorities.length > 0) return 'low';
    return null;
  }, [activeNotifications]);

  return {
    notifications,
    unreadCount,
    activeCount,
    highestPriority,
    activeNotifications,
    historyNotifications,
    markRead,
    markAllRead,
  };
}
