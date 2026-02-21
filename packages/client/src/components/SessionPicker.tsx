import { useState, useEffect, useRef } from 'react';
import type { SessionListEntry } from '@agent-viewer/shared';
import { RelativeTime } from './RelativeTime';

interface SessionPickerProps {
  sessions: SessionListEntry[];
  onSelect: (sessionId: string) => void;
}

export function SessionPicker({ sessions, onSelect }: SessionPickerProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const active = sessions.find((s) => s.active);

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
                <RelativeTime timestamp={s.lastActivity} className="session-picker-time" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
