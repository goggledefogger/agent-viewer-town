import { useState } from 'react';
import type { TeamState } from '@agent-viewer/shared';
import { TaskBoard } from './TaskBoard';
import { MessageLog } from './MessageLog';

interface SidebarProps {
  state: TeamState;
  open: boolean;
}

export function Sidebar({ state, open }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'messages'>('tasks');

  return (
    <div className={`sidebar ${open ? '' : 'sidebar-collapsed'}`}>
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks ({state.tasks.length})
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages ({state.messages.length})
        </button>
      </div>

      <div className="sidebar-content">
        {activeTab === 'tasks' ? (
          <TaskBoard tasks={state.tasks} agents={state.agents} />
        ) : (
          <MessageLog messages={state.messages} />
        )}
      </div>
    </div>
  );
}
