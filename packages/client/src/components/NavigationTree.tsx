import { useEffect, useRef, useState, useCallback } from 'react';
import type { ProjectGroup, SessionListEntry } from '@agent-viewer/shared';

interface NavigationTreeProps {
  visibleProjects: ProjectGroup[];
  searchFilter: string;
  hideIdle: boolean;
  isOpen: boolean;
  activeSessionId?: string;
  onSelectSession: (sessionId: string) => void;
  onSearchChange: (filter: string) => void;
  onToggleHideIdle: () => void;
  onClose: () => void;
}

function WaitingDot() {
  return <span className="nav-waiting-dot" title="Agent waiting for input" />;
}

/** Pick the best session in a project: waiting > most agents > most recent */
function pickBestSession(project: ProjectGroup): SessionListEntry | undefined {
  const allSessions = project.branches.flatMap((b) => b.sessions);
  if (allSessions.length === 0) return undefined;

  // Prefer sessions with waiting agents
  const waiting = allSessions.filter((s) => s.hasWaitingAgent);
  if (waiting.length > 0) {
    return waiting.reduce((best, s) => s.lastActivity > best.lastActivity ? s : best);
  }

  // Then prefer sessions with most agents
  const maxAgents = Math.max(...allSessions.map((s) => s.agentCount));
  const withMostAgents = allSessions.filter((s) => s.agentCount === maxAgents);

  // Among those, pick most recent
  return withMostAgents.reduce((best, s) => s.lastActivity > best.lastActivity ? s : best);
}

export function NavigationTree({
  visibleProjects,
  searchFilter,
  hideIdle,
  isOpen,
  activeSessionId,
  onSelectSession,
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
                  const best = pickBestSession(project);
                  if (best) onSelectSession(best.sessionId);
                  onClose();
                }}
              >
                <span className="nav-project-name">{project.projectName}</span>
                {project.hasWaitingAgent && <WaitingDot />}
                <span className="nav-project-meta">
                  <span>{project.totalAgents} agent{project.totalAgents !== 1 ? 's' : ''}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
