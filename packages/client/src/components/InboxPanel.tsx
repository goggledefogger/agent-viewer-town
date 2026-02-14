import { useState } from 'react';
import type { InboxNotification, NotificationType, AgentState } from '@agent-viewer/shared';

interface InboxPanelProps {
  activeNotifications: InboxNotification[];
  historyNotifications: InboxNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  agents?: AgentState[];
  onFocusAgent?: (agentId: string) => void;
}

const PRIORITY_COLORS: Record<NotificationType, string> = {
  permission_request: '#FFD700',
  ask_user_question: '#4169E1',
  plan_approval: '#9B59B6',
  task_completed: '#28A745',
  agent_error: '#DC3545',
  agent_idle: '#94a3b8',
  agent_stopped: '#6c757d',
};

const TYPE_LABELS: Record<NotificationType, string> = {
  permission_request: 'Permission',
  ask_user_question: 'Question',
  plan_approval: 'Plan Review',
  task_completed: 'Completed',
  agent_error: 'Error',
  agent_idle: 'Idle',
  agent_stopped: 'Stopped',
};

/** Pixel-art style notification icon */
function NotificationIcon({ type }: { type: NotificationType }) {
  const color = PRIORITY_COLORS[type];
  const size = 16;

  switch (type) {
    case 'permission_request':
      // Shield icon
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <path d="M8 1L3 3v4c0 3.5 2.5 6 5 7 2.5-1 5-3.5 5-7V3L8 1z"
                fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M6 8l2 2 3-4" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'ask_user_question':
      // Question mark
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke={color} strokeWidth="1.5" />
          <text x="8" y="11" textAnchor="middle" fill={color} fontSize="9" fontWeight="bold" fontFamily="monospace">?</text>
        </svg>
      );
    case 'plan_approval':
      // Clipboard icon
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <rect x="3" y="2" width="10" height="12" rx="1" fill="none" stroke={color} strokeWidth="1.5" />
          <line x1="5.5" y1="6" x2="10.5" y2="6" stroke={color} strokeWidth="1" />
          <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke={color} strokeWidth="1" />
          <line x1="5.5" y1="11" x2="8.5" y2="11" stroke={color} strokeWidth="1" />
        </svg>
      );
    case 'task_completed':
      // Checkmark
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke={color} strokeWidth="1.5" />
          <path d="M5 8l2 2.5 4-5" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'agent_error':
      // Warning triangle
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <path d="M8 2L1.5 13.5h13L8 2z" fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
          <text x="8" y="12" textAnchor="middle" fill={color} fontSize="8" fontWeight="bold" fontFamily="monospace">!</text>
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="4" fill={color} opacity="0.4" />
        </svg>
      );
  }
}

function NotificationCard({
  notification,
  onMarkRead,
  onFocusAgent,
}: {
  notification: InboxNotification;
  onMarkRead: (id: string) => void;
  onFocusAgent?: (agentId: string) => void;
}) {
  const color = PRIORITY_COLORS[notification.type];
  const isActive = !notification.resolved;

  return (
    <div
      className={`inbox-item ${notification.read ? 'read' : 'unread'} ${isActive ? 'active' : 'resolved'}`}
      style={{ borderLeftColor: color }}
      onClick={() => {
        if (!notification.read) onMarkRead(notification.id);
      }}
    >
      <div className="inbox-item-header">
        <NotificationIcon type={notification.type} />
        <span className="inbox-item-type" style={{ color }}>
          {TYPE_LABELS[notification.type]}
        </span>
        <span className="inbox-item-time">
          {new Date(notification.timestamp).toLocaleTimeString()}
        </span>
      </div>
      <div className="inbox-item-agent">
        {onFocusAgent ? (
          <button
            className="agent-link"
            onClick={(e) => {
              e.stopPropagation();
              onFocusAgent(notification.agentId);
            }}
          >
            {notification.agentName}
          </button>
        ) : (
          <span>{notification.agentName}</span>
        )}
      </div>
      <div className="inbox-item-message">{notification.body}</div>
      {isActive && (
        <div className="inbox-item-status-dot" style={{ backgroundColor: color }} />
      )}
    </div>
  );
}

type FilterMode = 'all' | 'active' | 'history';

export function InboxPanel({
  activeNotifications,
  historyNotifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onFocusAgent,
}: InboxPanelProps) {
  const [filter, setFilter] = useState<FilterMode>('all');

  const all = [...activeNotifications, ...historyNotifications];
  const displayed = filter === 'active' ? activeNotifications
    : filter === 'history' ? historyNotifications
    : all;

  if (all.length === 0) {
    return (
      <div className="inbox-panel inbox-empty">
        <svg width="48" height="48" viewBox="0 0 48 48" style={{ opacity: 0.3, margin: '20px auto', display: 'block' }}>
          <rect x="8" y="16" width="32" height="22" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 18l16 12 16-12" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <div style={{ color: 'var(--color-text-dim)', textAlign: 'center', fontSize: '13px' }}>
          No notifications yet
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-panel">
      <div className="inbox-toolbar">
        <div className="inbox-filters">
          {(['all', 'active', 'history'] as FilterMode[]).map((f) => (
            <button
              key={f}
              className={`inbox-filter ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${all.length})`
                : f === 'active' ? `Active (${activeNotifications.length})`
                : `History (${historyNotifications.length})`}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button className="inbox-mark-all" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>
      <div className="inbox-list">
        {displayed.map((n) => (
          <NotificationCard
            key={n.id}
            notification={n}
            onMarkRead={onMarkRead}
            onFocusAgent={onFocusAgent}
          />
        ))}
      </div>
    </div>
  );
}
