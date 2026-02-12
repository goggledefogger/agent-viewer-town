import { useState, useEffect, useRef } from 'react';
import type { SessionListEntry } from '@agent-viewer/shared';

interface SessionPickerProps {
  sessions: SessionListEntry[];
  onSelect: (sessionId: string) => void;
}

function relativeTime(timestamp: number): string {
  const delta = Math.floor((Date.now() - timestamp) / 1000);
  if (delta < 5) return 'just now';
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function SessionPicker({ sessions, onSelect }: SessionPickerProps) {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.active);

  // Update relative timestamps every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (sessions.length === 0) return null;

  // Single session: show inline, no dropdown
  if (sessions.length === 1) {
    const s = sessions[0];
    return (
      <div className="session-picker-inline">
        <span className="session-project-name">{s.projectName}</span>
        {s.gitBranch && (
          <span className="badge badge-branch">{s.gitBranch}</span>
        )}
        <span className={`badge ${s.isTeam ? 'badge-team' : 'badge-solo'}`}>
          {s.isTeam ? `Team (${s.agentCount})` : 'Solo'}
        </span>
      </div>
    );
  }

  // Multiple sessions: dropdown
  return (
    <div className="session-picker" ref={dropdownRef}>
      <button
        className="session-picker-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="session-project-name">
          {active?.projectName || 'Select session'}
        </span>
        {active?.gitBranch && (
          <span className="badge badge-branch">{active.gitBranch}</span>
        )}
        <span className="session-picker-arrow">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="session-picker-dropdown">
          {sessions.map((s) => (
            <button
              key={s.sessionId}
              className={`session-picker-item ${s.active ? 'active' : ''}`}
              onClick={() => {
                onSelect(s.sessionId);
                setOpen(false);
              }}
            >
              <div className="session-picker-item-top">
                <span className="session-project-name">{s.projectName}</span>
                <span className={`badge ${s.isTeam ? 'badge-team' : 'badge-solo'}`}>
                  {s.isTeam ? `Team (${s.agentCount})` : 'Solo'}
                </span>
              </div>
              <div className="session-picker-item-bottom">
                {s.gitBranch && (
                  <span className="badge badge-branch">{s.gitBranch}</span>
                )}
                <span className="session-picker-time">{relativeTime(s.lastActivity)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
