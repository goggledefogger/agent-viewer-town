import { useState } from 'react';
import type { TeamState } from '@agent-viewer/shared';
import { TaskBoard } from './TaskBoard';
import { MessageLog } from './MessageLog';

interface SidebarProps {
  state: TeamState;
  open: boolean;
  className?: string;
  forceTab?: 'tasks' | 'messages';
}

export function Sidebar({ state, open, className, forceTab }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'messages'>('tasks');
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
        </div>
      )}

      <div className="sidebar-content">
        {displayTab === 'tasks' ? (
          <TaskBoard tasks={state.tasks} agents={state.agents} />
        ) : (
          <MessageLog messages={state.messages} />
        )}
      </div>
    </div>
  );
}
