import { useState, useEffect, useCallback } from 'react';
import { Scene } from './components/Scene';
import { Sidebar } from './components/Sidebar';
import { AlertBar } from './components/AlertBar';
import { Breadcrumb } from './components/Breadcrumb';
import { NavigationTree } from './components/NavigationTree';
import { useWebSocket } from './hooks/useWebSocket';
import { useNotifications } from './hooks/useNotifications';
import { useNavigation } from './hooks/useNavigation';
import { useInbox } from './hooks/useInbox';
import type { ConnectionStatus } from './hooks/useWebSocket';

type MobileTab = 'scene' | 'inbox' | 'tasks' | 'messages';

function useIsMobile(breakpoint = 480) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

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
  const { team: state, sessions, groupedSessions, connectionStatus, selectSession } = useWebSocket('ws://localhost:3001/ws');
  const notifications = useNotifications(state.agents, state.session, sessions);
  const navigation = useNavigation(groupedSessions, state.session);
  const inbox = useInbox(state.agents, state.session, sessions);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileTab>('scene');
  const isMobile = useIsMobile();

  const session = state.session;
  const isSolo = session ? !session.isTeam : state.agents.length <= 1;

  const tasksByStatus = {
    pending: state.tasks.filter((t) => t.status === 'pending').length,
    in_progress: state.tasks.filter((t) => t.status === 'in_progress').length,
    completed: state.tasks.filter((t) => t.status === 'completed').length,
  };

  // Cross-component navigation state
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);

  // On mobile, determine which sidebar tab to force based on the mobile tab
  const mobileSidebarTab = mobileTab === 'messages' ? 'messages' as const
    : mobileTab === 'inbox' ? 'inbox' as const
    : 'tasks' as const;

  // Handle session selection from navigation
  const handleSelectSession = (sessionId: string) => {
    selectSession(sessionId);
    navigation.close();
  };

  // Navigate to an agent in the Scene (from sidebar clicks)
  const handleFocusAgent = useCallback((agentId: string) => {
    setFocusAgentId(agentId);
    if (isMobile) setMobileTab('scene');
    setTimeout(() => setFocusAgentId(null), 100);
  }, [isMobile]);

  // Navigate to a task in the TaskBoard (from Scene or within TaskBoard)
  const handleFocusTask = useCallback((taskId: string) => {
    setHighlightTaskId(taskId);
    if (isMobile) setMobileTab('tasks');
    setTimeout(() => setHighlightTaskId(null), 2200);
  }, [isMobile]);

  // Always show navigation breadcrumb when there are sessions
  const showNavigation = sessions.length >= 1;

  return (
    <div className="app-wrapper">
      <AlertBar
        waitingAgents={notifications.waitingAgents}
        onFocusAgent={handleFocusAgent}
      />
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
          {showNavigation ? (
            <Breadcrumb
              segments={navigation.breadcrumbs}
              onNavigate={navigation.zoomTo}
              onToggleDropdown={navigation.toggleOpen}
              waitingCount={navigation.waitingCount}
              isOpen={navigation.isOpen}
            >
              <NavigationTree
                zoomLevel={navigation.zoomLevel}
                visibleProjects={navigation.visibleProjects}
                currentProject={navigation.currentProject}
                currentBranch={navigation.currentBranch}
                searchFilter={navigation.searchFilter}
                hideIdle={navigation.hideIdle}
                isOpen={navigation.isOpen}
                activeSessionId={session?.sessionId}
                onSelectSession={handleSelectSession}
                onZoomTo={navigation.zoomTo}
                onSearchChange={navigation.setSearchFilter}
                onToggleHideIdle={navigation.toggleHideIdle}
                onClose={navigation.close}
              />
            </Breadcrumb>
          ) : null}
        </div>
        <div className="header-stats">
          {(() => {
            const mainAgents = state.agents.filter((a) => !a.isSubagent);
            const subs = state.agents.filter((a) => a.isSubagent);
            const workingSubs = subs.filter((a) => a.status === 'working').length;
            const doneSubs = subs.filter((a) => a.status === 'done').length;
            return (
              <>
                <span className="header-stat">
                  <span className="header-stat-value">{mainAgents.length}</span> {mainAgents.length === 1 ? 'agent' : 'agents'}
                </span>
                {subs.length > 0 && (
                  <>
                    <span className="header-stat-divider" />
                    <span className="header-stat">
                      <span className="header-stat-value">{workingSubs}</span>
                      <span className="header-stat-total">/{subs.length}</span> sub
                    </span>
                    {doneSubs > 0 && (
                      <span className="header-stat" style={{ color: 'var(--color-green)', fontSize: '10px' }}>
                        ({doneSubs} done)
                      </span>
                    )}
                  </>
                )}
              </>
            );
          })()}
          <span className="header-stat-divider" />
          <span className="header-stat">
            <span className="header-stat-value">{tasksByStatus.in_progress}</span> active
          </span>
          <span className="header-stat-divider" />
          <span className="header-stat">
            <span className="header-stat-value">{tasksByStatus.completed}</span>
            <span className="header-stat-total">/{state.tasks.length}</span> done
          </span>
          {notifications.waitingAgents.length > 0 && (
            <>
              <span className="header-stat-divider" />
              <span className="header-waiting-badge">
                {notifications.waitingAgents.length} waiting
              </span>
            </>
          )}
        </div>
        {notifications.permission !== 'unsupported' && (
          <button
            className={`notification-toggle ${notifications.enabled ? 'active' : ''}`}
            onClick={notifications.toggle}
            title={
              notifications.permission === 'denied'
                ? 'Notifications blocked by browser'
                : notifications.enabled
                  ? 'Disable notifications'
                  : 'Enable notifications for agent alerts'
            }
            disabled={notifications.permission === 'denied'}
          >
            {notifications.enabled ? '\uD83D\uDD14' : '\uD83D\uDD15'}
          </button>
        )}
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen((v) => !v)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? '\u25B6' : '\u25C0'}
        </button>
      </header>
      <nav className="mobile-tabs">
        <button
          className={`mobile-tab ${mobileTab === 'scene' ? 'active' : ''}`}
          onClick={() => setMobileTab('scene')}
        >
          Scene
        </button>
        <button
          className={`mobile-tab ${mobileTab === 'inbox' ? 'active' : ''}`}
          onClick={() => setMobileTab('inbox')}
        >
          Inbox
          {inbox.unreadCount > 0 && (
            <span className="inbox-badge">{inbox.unreadCount}</span>
          )}
        </button>
        <button
          className={`mobile-tab ${mobileTab === 'tasks' ? 'active' : ''}`}
          onClick={() => setMobileTab('tasks')}
        >
          Tasks ({state.tasks.length})
        </button>
        <button
          className={`mobile-tab ${mobileTab === 'messages' ? 'active' : ''}`}
          onClick={() => setMobileTab('messages')}
        >
          Messages ({state.messages.length})
        </button>
      </nav>
      <div className="app-body">
        <Scene
          state={state}
          className={isMobile && mobileTab !== 'scene' ? 'mobile-hidden' : undefined}
          focusAgentId={focusAgentId}
          onFocusTask={handleFocusTask}
        />
        <Sidebar
          state={state}
          open={sidebarOpen}
          className={isMobile && mobileTab === 'scene' ? 'mobile-hidden' : undefined}
          forceTab={isMobile ? mobileSidebarTab : undefined}
          onFocusAgent={handleFocusAgent}
          onFocusTask={handleFocusTask}
          highlightTaskId={highlightTaskId}
          activeNotifications={inbox.activeNotifications}
          historyNotifications={inbox.historyNotifications}
          unreadCount={inbox.unreadCount}
          onMarkRead={inbox.markRead}
          onMarkAllRead={inbox.markAllRead}
        />
      </div>
    </div>
  );
}
