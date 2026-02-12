import { useState, useEffect } from 'react';
import { Scene } from './components/Scene';
import { Sidebar } from './components/Sidebar';
import { SessionPicker } from './components/SessionPicker';
import { useWebSocket } from './hooks/useWebSocket';
import type { ConnectionStatus } from './hooks/useWebSocket';

function ConnectionDot({ status }: { status: ConnectionStatus }) {
  const label =
    status === 'connected' ? 'Connected' :
    status === 'reconnecting' ? 'Reconnecting...' :
    'Disconnected';

  return (
    <span className={`connection-dot ${status}`} title={label}>
      <span className="connection-dot-circle" />
      <span className="connection-dot-label">{label}</span>
    </span>
  );
}

function LiveIndicator({ lastActivity }: { lastActivity?: number }) {
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    function check() {
      if (!lastActivity) { setIsLive(false); return; }
      setIsLive(Date.now() - lastActivity < 10_000);
    }
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  if (!isLive) return null;

  return (
    <span className="live-indicator" title="Session active">
      <span className="live-dot" />
      <span className="live-label">Live</span>
    </span>
  );
}

export default function App() {
  const { team: state, sessions, connectionStatus, selectSession } = useWebSocket('ws://localhost:3001/ws');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const session = state.session;
  const isSolo = session ? !session.isTeam : state.agents.length <= 1;

  const tasksByStatus = {
    pending: state.tasks.filter((t) => t.status === 'pending').length,
    in_progress: state.tasks.filter((t) => t.status === 'in_progress').length,
    completed: state.tasks.filter((t) => t.status === 'completed').length,
  };

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div className="header-left">
          <ConnectionDot status={connectionStatus} />
          <span className="header-team-name">
            {state.name || 'Agent Viewer Town'}
          </span>
          {session && (
            <>
              <LiveIndicator lastActivity={session.lastActivity} />
              <span className={`badge ${isSolo ? 'badge-solo' : 'badge-team'}`}>
                {isSolo ? 'Solo' : `Team (${state.agents.length})`}
              </span>
              {session.gitBranch && (
                <span className="badge badge-branch">{session.gitBranch}</span>
              )}
            </>
          )}
          <SessionPicker sessions={sessions} onSelect={selectSession} />
        </div>
        <div className="header-stats">
          <span className="header-stat">
            <span className="header-stat-value">{state.agents.length}</span> {state.agents.length === 1 ? 'agent' : 'agents'}
          </span>
          <span className="header-stat-divider" />
          <span className="header-stat">
            <span className="header-stat-value">{tasksByStatus.in_progress}</span> active
          </span>
          <span className="header-stat-divider" />
          <span className="header-stat">
            <span className="header-stat-value">{tasksByStatus.completed}</span>
            <span className="header-stat-total">/{state.tasks.length}</span> done
          </span>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '\u25B6' : '\u25C0'}
        </button>
      </header>
      <div className="app-body">
        <Scene state={state} />
        <Sidebar state={state} open={sidebarOpen} />
      </div>
    </div>
  );
}
