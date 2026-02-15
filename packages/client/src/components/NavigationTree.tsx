import { useEffect, useRef, useState, useCallback } from 'react';
import type { ProjectGroup, BranchGroup, SessionListEntry } from '@agent-viewer/shared';
import type { ZoomLevel } from '../hooks/useNavigation';

interface NavigationTreeProps {
  zoomLevel: ZoomLevel;
  visibleProjects: ProjectGroup[];
  currentProject?: ProjectGroup;
  currentBranch?: BranchGroup;
  searchFilter: string;
  hideIdle: boolean;
  isOpen: boolean;
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onZoomTo: (level: ZoomLevel, projectKey?: string, branch?: string) => void;
  onSearchChange: (filter: string) => void;
  onToggleHideIdle: () => void;
  onClose: () => void;
}

function relativeTime(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

function WaitingDot() {
  return <span className="nav-waiting-dot" title="Agent waiting for input" />;
}

export function NavigationTree({
  zoomLevel,
  visibleProjects,
  currentProject,
  currentBranch,
  searchFilter,
  hideIdle,
  isOpen,
  activeSessionId,
  onSelectSession,
  onZoomTo,
  onSearchChange,
  onToggleHideIdle,
  onClose,
}: NavigationTreeProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [, setTick] = useState(0);

  // Update relative timestamps periodically
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
      setFocusIndex(-1);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Check if click was on the breadcrumb trigger (let it handle toggle)
        const target = e.target as HTMLElement;
        if (target.closest('.nav-breadcrumb-trigger')) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Get all focusable rows
      const rows = panelRef.current?.querySelectorAll('[data-nav-row]');
      if (!rows || rows.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, rows.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, -1));
      } else if (e.key === 'Enter' && focusIndex >= 0) {
        e.preventDefault();
        const row = rows[focusIndex] as HTMLElement;
        row.click();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusIndex(rows.length - 1);
      }
    },
    [focusIndex, onClose]
  );

  // Scroll focused row into view
  useEffect(() => {
    if (focusIndex < 0) return;
    const rows = panelRef.current?.querySelectorAll('[data-nav-row]');
    if (rows && rows[focusIndex]) {
      rows[focusIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [focusIndex]);

  if (!isOpen) return null;

  const renderLevel0 = () => (
    <div className="nav-level-content">
      {visibleProjects.length === 0 ? (
        <div className="nav-empty">
          {searchFilter ? `No sessions matching "${searchFilter}"` : 'No active sessions'}
        </div>
      ) : (
        visibleProjects.map((project, pIdx) => (
          <ProjectRow
            key={project.projectKey}
            project={project}
            activeSessionId={activeSessionId}
            startIndex={visibleProjects
              .slice(0, pIdx)
              .reduce((sum, p) => sum + 1 + p.branches.length, 0)}
            focusIndex={focusIndex}
            onSelectProject={(key, mostRecentSessionId) => {
              // Select the project's most recent session to update the scene,
              // then zoom the dropdown to show branches
              onSelectSession(mostRecentSessionId);
              onZoomTo(1, key);
            }}
            onSelectBranch={(key, branch, sessions) => {
              // Always select the first (most active) session to update the scene
              onSelectSession(sessions[0].sessionId);
              if (sessions.length === 1) {
                onClose();
              } else {
                onZoomTo(2, key, branch);
              }
            }}
            onSelectSession={(id) => {
              onSelectSession(id);
              onClose();
            }}
          />
        ))
      )}
    </div>
  );

  const renderLevel1 = () => {
    if (!currentProject) return null;
    return (
      <div className="nav-level-content">
        <button
          className="nav-back-button"
          data-nav-row
          onClick={() => onZoomTo(0)}
        >
          &lt; All Projects
        </button>
        <div className="nav-project-header">
          {currentProject.projectName}
          <span className="nav-project-stats">
            {currentProject.totalSessions} session{currentProject.totalSessions !== 1 ? 's' : ''}, {currentProject.totalAgents} agent{currentProject.totalAgents !== 1 ? 's' : ''}
          </span>
        </div>
        {currentProject.branches.map((branch) => (
          <div key={branch.branch} className="nav-branch-section">
            <div className="nav-branch-header">
              {branch.branch}
              {branch.hasWaitingAgent && <WaitingDot />}
            </div>
            {branch.sessions.map((session) => (
              <button
                key={session.sessionId}
                className={`nav-session-row ${session.sessionId === activeSessionId ? 'active' : ''}`}
                data-nav-row
                onClick={() => {
                  onSelectSession(session.sessionId);
                  onClose();
                }}
              >
                <div className="nav-session-top">
                  <span className="nav-session-slug">{session.slug || session.projectName}</span>
                  <span className={`badge ${session.isTeam ? 'badge-team' : 'badge-solo'}`}>
                    {session.isTeam ? `Team (${session.agentCount})` : 'Solo'}
                  </span>
                </div>
                <div className="nav-session-bottom">
                  {session.hasWaitingAgent && <WaitingDot />}
                  <span className="nav-session-time">{relativeTime(session.lastActivity)}</span>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const renderLevel2 = () => {
    if (!currentProject || !currentBranch) return null;
    return (
      <div className="nav-level-content">
        <button
          className="nav-back-button"
          data-nav-row
          onClick={() => onZoomTo(1, currentProject.projectKey)}
        >
          &lt; {currentProject.projectName}
        </button>
        <div className="nav-branch-header nav-branch-header-detail">
          {currentBranch.branch}
          {currentBranch.hasWaitingAgent && <WaitingDot />}
        </div>
        {currentBranch.sessions.map((session) => (
          <button
            key={session.sessionId}
            className={`nav-session-row nav-session-detail ${session.sessionId === activeSessionId ? 'active' : ''}`}
            data-nav-row
            onClick={() => {
              onSelectSession(session.sessionId);
              onClose();
            }}
          >
            <div className="nav-session-top">
              <span className="nav-session-slug">{session.slug || session.projectName}</span>
              <span className="nav-session-time">{relativeTime(session.lastActivity)}</span>
            </div>
            <div className="nav-session-meta">
              <span className={`badge ${session.isTeam ? 'badge-team' : 'badge-solo'}`}>
                {session.isTeam ? `Team (${session.agentCount})` : 'Solo'}
              </span>
              {session.agentCount > 0 && (
                <span className="nav-session-agent-count">
                  {session.agentCount} agent{session.agentCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {session.hasWaitingAgent && (
              <div className="nav-session-waiting">
                <WaitingDot /> Agent waiting for input
              </div>
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div
      className="nav-tree-panel"
      ref={panelRef}
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-label="Session navigation"
    >
      <div className="nav-filter-bar">
        <div className="nav-search-wrapper">
          <input
            ref={searchRef}
            className="nav-search-input"
            type="text"
            placeholder="Search..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchFilter && (
            <button
              className="nav-search-clear"
              onClick={() => onSearchChange('')}
              title="Clear search"
            >
              x
            </button>
          )}
        </div>
        <button
          className={`nav-filter-toggle ${hideIdle ? 'active' : ''}`}
          onClick={onToggleHideIdle}
          title="Hide idle sessions (>5min inactive)"
        >
          Active Only
        </button>
      </div>
      {zoomLevel === 0 && renderLevel0()}
      {zoomLevel === 1 && renderLevel1()}
      {zoomLevel === 2 && renderLevel2()}
    </div>
  );
}

// Sub-components

interface ProjectRowProps {
  project: ProjectGroup;
  activeSessionId?: string;
  startIndex: number;
  focusIndex: number;
  onSelectProject: (key: string, mostRecentSessionId: string) => void;
  onSelectBranch: (projectKey: string, branch: string, sessions: SessionListEntry[]) => void;
  onSelectSession: (sessionId: string) => void;
}

function ProjectRow({
  project,
  activeSessionId,
  startIndex,
  focusIndex,
  onSelectProject,
  onSelectBranch,
  onSelectSession,
}: ProjectRowProps) {
  const [expanded, setExpanded] = useState(true);
  const isProjectFocused = focusIndex === startIndex;

  return (
    <div className="nav-project-group">
      <button
        className={`nav-project-row ${isProjectFocused ? 'focused' : ''}`}
        data-nav-row
        onClick={() => {
          // Find the most recent session across all branches for this project
          const allSessions = project.branches.flatMap(b => b.sessions);
          const best = allSessions[0]; // Already sorted: active > waiting > recent
          if (best) onSelectProject(project.projectKey, best.sessionId);
        }}
      >
        <span
          className="nav-expand-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? '\u25BC' : '\u25B6'}
        </span>
        <span className="nav-project-name">{project.projectName}</span>
        {project.hasWaitingAgent && <WaitingDot />}
        <span className="nav-project-counts">
          {project.totalSessions} | {project.totalAgents}
        </span>
      </button>
      {expanded &&
        project.branches.map((branch, bIdx) => {
          const branchFocused = focusIndex === startIndex + 1 + bIdx;
          const isCurrentBranch = branch.sessions.some(
            (s) => s.sessionId === activeSessionId
          );
          return (
            <button
              key={branch.branch}
              className={`nav-branch-row ${branchFocused ? 'focused' : ''} ${isCurrentBranch ? 'current' : ''}`}
              data-nav-row
              onClick={() => onSelectBranch(project.projectKey, branch.branch, branch.sessions)}
            >
              {isCurrentBranch && <span className="nav-current-marker">[*]</span>}
              <span className="nav-branch-name">{branch.branch}</span>
              <span className={`badge ${branch.sessions.some((s) => s.isTeam) ? 'badge-team' : 'badge-solo'}`}>
                {branch.sessions.some((s) => s.isTeam)
                  ? `Team(${branch.totalAgents})`
                  : `Solo(${branch.totalAgents})`}
              </span>
              {branch.hasWaitingAgent && <WaitingDot />}
              <span className="nav-branch-time">{relativeTime(branch.lastActivity)}</span>
            </button>
          );
        })}
    </div>
  );
}
