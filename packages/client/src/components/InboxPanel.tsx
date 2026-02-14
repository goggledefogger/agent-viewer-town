import { useState } from 'react';
import type { InboxNotification, NotificationType } from '@agent-viewer/shared';
import type { InboxPriority } from '../hooks/useInbox';
import { getPriority } from '../hooks/useInbox';

/** Priority-to-color mapping for notification cards */
const PRIORITY_COLORS: Record<InboxPriority, string> = {
  critical: '#DC3545',
  high: '#FF8C00',
  medium: '#4169E1',
  low: '#6C757D',
};

/** Notification type display labels */
const TYPE_LABELS: Record<NotificationType, string> = {
  permission_request: 'Permission',
  ask_user_question: 'Question',
  plan_approval: 'Plan Approval',
  task_completed: 'Task Done',
  agent_error: 'Error',
  agent_idle: 'Idle',
  agent_stopped: 'Stopped',
};

/** Pixel-art style icon for each notification type (inline SVG) */
function NotificationIcon({ type, size = 14 }: { type: NotificationType; size?: number }) {
  const color = PRIORITY_COLORS[getPriority(type)];
  const s = size;
  const half = s / 2;

  switch (type) {
    case 'permission_request':
      // Shield icon
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <path
            d={`M${half} 1 L${s - 2} 3 V${half + 1} C${s - 2} ${s - 3} ${half} ${s - 1} ${half} ${s - 1} C${half} ${s - 1} 2 ${s - 3} 2 ${half + 1} V3 Z`}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text x={half} y={half + 3} textAnchor="middle" fill={color} fontSize="8" fontWeight="bold" fontFamily="monospace">!</text>
        </svg>
      );
    case 'ask_user_question':
      // Question mark in circle
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <circle cx={half} cy={half} r={half - 1.5} fill="none" stroke={color} strokeWidth="1.5" />
          <text x={half} y={half + 3} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold" fontFamily="monospace">?</text>
        </svg>
      );
    case 'plan_approval':
      // Clipboard icon
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <rect x="2" y="3" width={s - 4} height={s - 4} rx="1" fill="none" stroke={color} strokeWidth="1.2" />
          <rect x={half - 2} y="1" width="4" height="3" rx="1" fill={color} />
          <line x1="4" y1={half} x2={s - 4} y2={half} stroke={color} strokeWidth="1" />
          <line x1="4" y1={half + 3} x2={s - 6} y2={half + 3} stroke={color} strokeWidth="1" />
        </svg>
      );
    case 'task_completed':
      // Checkmark in circle
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <circle cx={half} cy={half} r={half - 1.5} fill="none" stroke={color} strokeWidth="1.5" />
          <path
            d={`M${half - 3} ${half} L${half - 0.5} ${half + 2.5} L${half + 3.5} ${half - 2.5}`}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'agent_error':
      // Warning triangle
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <path
            d={`M${half} 2 L${s - 1} ${s - 2} H1 Z`}
            fill="none"
            stroke={color}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <text x={half} y={s - 4} textAnchor="middle" fill={color} fontSize="8" fontWeight="bold" fontFamily="monospace">!</text>
        </svg>
      );
    default:
      // Simple dot
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <circle cx={half} cy={half} r="3" fill={color} />
        </svg>
      );
  }
}

/** Format timestamp to relative time string */
function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

interface NotificationCardProps {
  notification: InboxNotification;
  onRead: (id: string) => void;
  onFocusAgent?: (agentId: string) => void;
}

function NotificationCard({ notification, onRead, onFocusAgent }: NotificationCardProps) {
  const priority = getPriority(notification.type);
  const color = PRIORITY_COLORS[priority];
  const isUnread = !notification.read;
  const isResolved = notification.resolved;

  return (
    <div
      className={`inbox-notification ${priority} ${isUnread ? 'unread' : ''} ${isResolved ? 'resolved' : ''}`}
      style={{
        borderLeftColor: color,
      }}
      onClick={() => {
        if (isUnread) onRead(notification.id);
        if (onFocusAgent) onFocusAgent(notification.agentId);
      }}
    >
      <div className="inbox-notification-header">
        <NotificationIcon type={notification.type} />
        <span className="inbox-notification-type" style={{ color }}>
          {TYPE_LABELS[notification.type]}
        </span>
        <span className="inbox-notification-time">{timeAgo(notification.timestamp)}</span>
        {isUnread && <span className="inbox-unread-dot" style={{ background: color }} />}
      </div>
      <div className="inbox-notification-title">{notification.title}</div>
      <div className="inbox-notification-body">{notification.body}</div>
      {notification.context && (
        <div className="inbox-notification-context">{notification.context}</div>
      )}
    </div>
  );
}

type InboxFilter = 'all' | 'active' | 'history';

interface InboxPanelProps {
  activeNotifications: InboxNotification[];
  historyNotifications: InboxNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onFocusAgent?: (agentId: string) => void;
}

export function InboxPanel({
  activeNotifications,
  historyNotifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  onFocusAgent,
}: InboxPanelProps) {
  const [filter, setFilter] = useState<InboxFilter>('all');

  const displayNotifications =
    filter === 'active' ? activeNotifications :
    filter === 'history' ? historyNotifications :
    [...activeNotifications, ...historyNotifications];

  return (
    <div className="inbox-panel">
      <div className="inbox-toolbar">
        <div className="inbox-filters">
          <button
            className={`inbox-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`inbox-filter-btn ${filter === 'active' ? 'active' : ''}`}
            onClick={() => setFilter('active')}
          >
            Active ({activeNotifications.length})
          </button>
          <button
            className={`inbox-filter-btn ${filter === 'history' ? 'active' : ''}`}
            onClick={() => setFilter('history')}
          >
            History ({historyNotifications.length})
          </button>
        </div>
        {unreadCount > 0 && (
          <button className="inbox-mark-all-read" onClick={onMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>
      <div className="inbox-list">
        {displayNotifications.length === 0 ? (
          <div className="inbox-empty">
            <div className="inbox-empty-icon">
              <svg width="32" height="32" viewBox="0 0 32 32">
                <rect x="4" y="8" width="24" height="18" rx="2" fill="none" stroke="var(--color-text-dim)" strokeWidth="1.5" />
                <path d="M4 10 L16 20 L28 10" fill="none" stroke="var(--color-text-dim)" strokeWidth="1.5" />
              </svg>
            </div>
            <span>No notifications</span>
          </div>
        ) : (
          displayNotifications.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onRead={onMarkRead}
              onFocusAgent={onFocusAgent}
            />
          ))
        )}
      </div>
    </div>
  );
}
