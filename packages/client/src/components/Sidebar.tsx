import { useState } from 'react';
import type { TeamState } from '@agent-viewer/shared';
import { TaskBoard } from './TaskBoard';
import { MessageLog } from './MessageLog';

interface SidebarProps {
  state: TeamState;
}

export function Sidebar({ state }: SidebarProps) {
  const [activeTab, setActiveTab] = useState<'tasks' | 'messages'>('tasks');

  return (
    <div className="sidebar">
      <div style={{ padding: '12px', borderBottom: '2px solid var(--color-border)' }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--color-gold)' }}>
          {state.name ? `Team: ${state.name}` : 'No Active Team'}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginTop: '2px' }}>
          {state.agents.length} agents · {state.tasks.length} tasks
        </div>
      </div>

      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          Tasks
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
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
