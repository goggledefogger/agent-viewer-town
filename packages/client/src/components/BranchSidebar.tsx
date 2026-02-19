import { useState, useEffect } from 'react';
import type { BranchGroup } from '@agent-viewer/shared';
import { getBranchColor } from '../constants/colors';

interface BranchSidebarProps {
  projectName: string;
  projectBranches: BranchGroup[];
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  currentBranch?: string;
}

function isRecentlyActive(lastActivity: number, thresholdMs = 10_000): boolean {
  return Date.now() - lastActivity < thresholdMs;
}

function ActivityDot({ lastActivity }: { lastActivity: number }) {
  const [active, setActive] = useState(() => isRecentlyActive(lastActivity));

  useEffect(() => {
    setActive(isRecentlyActive(lastActivity));
    const interval = setInterval(() => setActive(isRecentlyActive(lastActivity)), 2000);
    return () => clearInterval(interval);
  }, [lastActivity]);

  if (!active) return null;
  return <span className="branch-sidebar-activity-dot" title="Active" />;
}

export function BranchSidebar({
  projectName,
  projectBranches,
  activeSessionId,
  onSelectSession,
  currentBranch,
}: BranchSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        className="branch-sidebar-toggle branch-sidebar-toggle--collapsed"
        onClick={() => setCollapsed(false)}
        title="Show branch sidebar"
      >
        <span className="branch-sidebar-toggle-icon">{'\u25B6'}</span>
      </button>
    );
  }

  return (
    <div className="branch-sidebar">
      <div className="branch-sidebar-header">
        <span className="branch-sidebar-title" title={projectName}>
          {projectName}
        </span>
        <button
          className="branch-sidebar-toggle"
          onClick={() => setCollapsed(true)}
          title="Hide branch sidebar"
        >
          {'\u25C0'}
        </button>
      </div>

      <div className="branch-sidebar-list">
        {projectBranches.map((bg) => {
          const color = getBranchColor(bg.branch);
          const isActiveBranch = bg.branch === currentBranch;
          const hasSingleSession = bg.sessions.length === 1;

          return (
            <div key={bg.branch} className="branch-sidebar-branch">
              {/* Branch header row */}
              <div
                className={`branch-sidebar-item${isActiveBranch ? ' branch-sidebar-item--active' : ''}`}
                onClick={hasSingleSession ? () => onSelectSession(bg.sessions[0].sessionId) : undefined}
                style={hasSingleSession ? { cursor: 'pointer' } : undefined}
              >
                <span className="branch-sidebar-color-dot" style={{ background: color }} />
                <span className="branch-sidebar-branch-name" title={bg.branch}>
                  {bg.branch}
                </span>
                <span className="branch-sidebar-badges">
                  {bg.totalAgents > 0 && (
                    <span className="branch-sidebar-agent-count">{bg.totalAgents}</span>
                  )}
                  <ActivityDot lastActivity={bg.lastActivity} />
                  {bg.hasWaitingAgent && (
                    <span className="branch-sidebar-waiting-dot" title="Waiting for input" />
                  )}
                </span>
              </div>

              {/* Session list (only if branch has multiple sessions) */}
              {!hasSingleSession && bg.sessions.length > 0 && (
                <div className="branch-sidebar-sessions">
                  {bg.sessions.map((s) => {
                    const isActiveSession = s.sessionId === activeSessionId;
                    return (
                      <div
                        key={s.sessionId}
                        className={`branch-sidebar-session${isActiveSession ? ' branch-sidebar-session--active' : ''}`}
                        onClick={() => onSelectSession(s.sessionId)}
                      >
                        <span className="branch-sidebar-session-slug">{s.slug}</span>
                        <span className="branch-sidebar-session-badges">
                          <span className={`branch-sidebar-session-type ${s.isTeam ? 'type-team' : 'type-solo'}`}>
                            {s.isTeam ? 'Team' : 'Solo'}
                          </span>
                          {s.agentCount > 0 && (
                            <span className="branch-sidebar-agent-count">{s.agentCount}</span>
                          )}
                          {s.hasWaitingAgent && (
                            <span className="branch-sidebar-waiting-dot" title="Waiting for input" />
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
