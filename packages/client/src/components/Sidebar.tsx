import { useState } from 'react';
import type { TeamState, InboxNotification } from '@agent-viewer/shared';
import type { InboxPriority } from '../hooks/useInbox';
import { TaskBoard } from './TaskBoard';
import { MessageLog } from './MessageLog';
import { InboxPanel } from './InboxPanel';

type SidebarTab = 'tasks' | 'messages' | 'inbox';

interface SidebarProps {
  state: TeamState;
  open: boolean;
  className?: string;
  forceTab?: SidebarTab;
  onFocusAgent?: (agentId: string) => void;
  onFocusTask?: (taskId: string) => void;
  highlightTaskId?: string | null;
  /** Inbox data from useInbox hook */
  inboxActive?: InboxNotification[];
  inboxHistory?: InboxNotification[];
  inboxUnreadCount?: number;
  inboxPriority?: InboxPriority | null;
  onInboxMarkRead?: (id: string) => void;
  onInboxMarkAllRead?: () => void;
}

export function Sidebar({
  state,
  open,
  className,
  forceTab,
  onFocusAgent,
  onFocusTask,
  highlightTaskId,
  inboxActive = [],
  inboxHistory = [],
  inboxUnreadCount = 0,
  inboxPriority,
  onInboxMarkRead,
  onInboxMarkAllRead,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('tasks');
  const displayTab = forceTab || activeTab;

  return (
    <div className={`sidebar ${open ? '' : 'sidebar-collapsed'}${className ? ` ${className}` : ''}`}>
      {!forceTab && (
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${displayTab === 'tasks' ? 'active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks ({state.tasks.length})
          </button>
          <button
            className={`sidebar-tab ${displayTab === 'messages' ? 'active' : ''}`}
            onClick={() => setActiveTab('messages')}
          >
            Messages ({state.messages.length})
          </button>
          <button
            className={`sidebar-tab ${displayTab === 'inbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('inbox')}
          >
            Inbox
            {inboxUnreadCount > 0 && inboxPriority && (
              <span className={`sidebar-tab-badge ${inboxPriority}`}>
                {inboxUnreadCount}
              </span>
            )}
          </button>
        </div>
      )}

      <div className="sidebar-content">
        {displayTab === 'tasks' ? (
          <TaskBoard
            tasks={state.tasks}
            agents={state.agents}
            onFocusAgent={onFocusAgent}
            onFocusTask={onFocusTask}
            highlightTaskId={highlightTaskId}
          />
        ) : displayTab === 'inbox' ? (
          <InboxPanel
            activeNotifications={inboxActive}
            historyNotifications={inboxHistory}
            unreadCount={inboxUnreadCount}
            onMarkRead={onInboxMarkRead || (() => {})}
            onMarkAllRead={onInboxMarkAllRead || (() => {})}
            onFocusAgent={onFocusAgent}
          />
        ) : (
          <MessageLog
            messages={state.messages}
            agents={state.agents}
            onFocusAgent={onFocusAgent}
          />
        )}
      </div>
    </div>
  );
}
