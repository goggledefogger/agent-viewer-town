import { useEffect, useRef, useState, useCallback } from 'react';
import type { ProjectGroup, BranchGroup, SessionListEntry } from '@agent-viewer/shared';
import type { ZoomLevel } from '../hooks/useNavigation';
import { RelativeTime } from './RelativeTime';

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

  // ---- Level 0: Project list (drill-down, no inline expansion) ----
  const renderLevel0 = () => (
    <div className="nav-level-content">
      {visibleProjects.length === 0 ? (
        <div className="nav-empty">
          {searchFilter ? `No sessions matching "${searchFilter}"` : 'No active sessions'}
        </div>
      ) : (
        visibleProjects.map((project, pIdx) => {
          const isFocused = focusIndex === pIdx;
          const isActive = activeSessionId != null && project.branches.some((b) =>
            b.sessions.some((s) => s.sessionId === activeSessionId)
          );
          return (
            <button
              key={project.projectKey}
              className={`nav-project-row ${isFocused ? 'focused' : ''} ${isActive ? 'active' : ''}`}
              data-nav-row
              onClick={() => {
                // Select best session for scene, then drill into project
                const allSessions = project.branches.flatMap((b) => b.sessions);
                const best = allSessions[0];
                if (best) onSelectSession(best.sessionId);
                // If only one branch, skip to level 2
                if (project.branches.length === 1) {
                  const branch = project.branches[0];
                  if (branch.sessions.length === 1) {
                    // Single branch, single session: just select and close
                    onClose();
                  } else {
                    onZoomTo(2, project.projectKey, branch.branch);
                  }
                } else {
                  onZoomTo(1, project.projectKey);
                }
              }}
            >
              <span className="nav-project-name">{project.projectName}</span>
              {project.hasWaitingAgent && <WaitingDot />}
              <span className="nav-project-meta">
                <span>{project.branches.length} branch{project.branches.length !== 1 ? 'es' : ''}</span>
                <span className="nav-meta-sep">/</span>
                <span>{project.totalSessions} session{project.totalSessions !== 1 ? 's' : ''}</span>
              </span>
              <span className="nav-row-arrow">&gt;</span>
            </button>
          );
        })
      )}
    </div>
  );

  // ---- Level 1: Branch list for selected project ----
  const renderLevel1 = () => {
    if (!currentProject) return null;
    return (
      <div className="nav-level-content">
        <button
          className="nav-back-button"
          data-nav-row
          onClick={() => onZoomTo(0)}
        >
          &larr; All Projects
        </button>
        <div className="nav-level-header">
          <span className="nav-level-header-name">{currentProject.projectName}</span>
          <span className="nav-level-header-stats">
            {currentProject.totalSessions} session{currentProject.totalSessions !== 1 ? 's' : ''}, {currentProject.totalAgents} agent{currentProject.totalAgents !== 1 ? 's' : ''}
          </span>
        </div>
        {currentProject.branches.map((branch) => {
          const isBranchActive = activeSessionId != null && branch.sessions.some((s) => s.sessionId === activeSessionId);
          return (
          <button
            key={branch.branch}
            className={`nav-branch-row ${isBranchActive ? 'active' : ''}`}
            data-nav-row
            onClick={() => {
              // Select best session for this branch
              onSelectSession(branch.sessions[0].sessionId);
              if (branch.sessions.length === 1) {
                // Single session on this branch: select and close
                onClose();
              } else {
                onZoomTo(2, currentProject.projectKey, branch.branch);
              }
            }}
          >
            <span className="nav-branch-name">{branch.branch}</span>
            {branch.hasWaitingAgent && <WaitingDot />}
            <span className="nav-project-meta">
              <span>{branch.sessions.length} session{branch.sessions.length !== 1 ? 's' : ''}</span>
              <span className="nav-meta-sep">/</span>
              <span>{branch.totalAgents} agent{branch.totalAgents !== 1 ? 's' : ''}</span>
            </span>
            {branch.sessions.length > 1 && <span className="nav-row-arrow">&gt;</span>}
          </button>
        );
        })}
      </div>
    );
  };

  // ---- Level 2: Session list for selected branch ----
  const renderLevel2 = () => {
    if (!currentProject || !currentBranch) return null;
    return (
      <div className="nav-level-content">
        <button
          className="nav-back-button"
          data-nav-row
          onClick={() => onZoomTo(1, currentProject.projectKey)}
        >
          &larr; {currentProject.projectName}
        </button>
        <div className="nav-level-header">
          <span className="nav-level-header-name">{currentBranch.branch}</span>
          <span className="nav-level-header-stats">
            {currentBranch.sessions.length} session{currentBranch.sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        {currentBranch.sessions.map((session) => (
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
              {session.hasWaitingAgent && (
                <>
                  <WaitingDot />
                  <span className="nav-session-waiting-label">Waiting</span>
                </>
              )}
              <RelativeTime timestamp={session.lastActivity} className="nav-session-time" />
            </div>
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
          title="Show only sessions with active or waiting agents"
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
