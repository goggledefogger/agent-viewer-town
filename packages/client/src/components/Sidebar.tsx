import { useState } from 'react';
import type { TeamState, AgentState, InboxNotification } from '@agent-viewer/shared';
import { TaskBoard } from './TaskBoard';
import { MessageLog } from './MessageLog';
import { InboxPanel } from './InboxPanel';

type SidebarTab = 'inbox' | 'tasks' | 'messages';

interface SidebarProps {
  state: TeamState;
  open: boolean;
  className?: string;
  forceTab?: SidebarTab;
  onFocusAgent?: (agentId: string) => void;
  onFocusTask?: (taskId: string) => void;
  highlightTaskId?: string | null;
  activeNotifications?: InboxNotification[];
  historyNotifications?: InboxNotification[];
  unreadCount?: number;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

export function Sidebar({
  state, open, className, forceTab,
  onFocusAgent, onFocusTask, highlightTaskId,
  activeNotifications = [], historyNotifications = [],
  unreadCount = 0, onMarkRead, onMarkAllRead,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>('tasks');
  const displayTab = forceTab || activeTab;

  return (
    <div className={`sidebar ${open ? '' : 'sidebar-collapsed'}${className ? ` ${className}` : ''}`}>
      {!forceTab && (
        <div className="sidebar-tabs">
          <button
            className={`sidebar-tab ${displayTab === 'inbox' ? 'active' : ''}`}
            onClick={() => setActiveTab('inbox')}
          >
            Inbox
            {unreadCount > 0 && (
              <span className="inbox-badge">{unreadCount}</span>
            )}
          </button>
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
        </div>
      )}

      <div className="sidebar-content">
        {displayTab === 'inbox' ? (
          <InboxPanel
            activeNotifications={activeNotifications}
            historyNotifications={historyNotifications}
            unreadCount={unreadCount}
            onMarkRead={onMarkRead || (() => {})}
            onMarkAllRead={onMarkAllRead || (() => {})}
            agents={state.agents}
            onFocusAgent={onFocusAgent}
          />
        ) : displayTab === 'tasks' ? (
          <TaskBoard
            tasks={state.tasks}
            agents={state.agents}
            onFocusAgent={onFocusAgent}
            onFocusTask={onFocusTask}
            highlightTaskId={highlightTaskId}
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
