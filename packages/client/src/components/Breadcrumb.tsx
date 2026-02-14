import type { ReactNode } from 'react';
import type { BreadcrumbSegment, ZoomLevel } from '../hooks/useNavigation';

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onNavigate: (level: ZoomLevel, projectKey?: string, branch?: string) => void;
  onToggleDropdown: () => void;
  waitingCount: number;
  isOpen: boolean;
  children?: ReactNode;
}

export function Breadcrumb({
  segments,
  onNavigate,
  onToggleDropdown,
  waitingCount,
  isOpen,
  children,
}: BreadcrumbProps) {
  return (
    <nav className="nav-breadcrumb" aria-label="Session navigation">
      <button
        className={`nav-breadcrumb-trigger ${isOpen ? 'open' : ''}`}
        onClick={onToggleDropdown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <span className="nav-breadcrumb-segments">
          {segments.map((seg, i) => (
            <span key={`${seg.level}-${seg.label}`} className="nav-breadcrumb-segment-wrapper">
              {i > 0 && <span className="nav-breadcrumb-sep"> &gt; </span>}
              {seg.isCurrent ? (
                <span className="nav-breadcrumb-current">{seg.label}</span>
              ) : (
                <button
                  className="nav-breadcrumb-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(seg.level, seg.projectKey, seg.branch);
                  }}
                >
                  {seg.label}
                </button>
              )}
            </span>
          ))}
        </span>
        <span className="nav-breadcrumb-controls">
          {waitingCount > 0 && (
            <span className="nav-waiting-badge" title={`${waitingCount} session${waitingCount > 1 ? 's' : ''} need${waitingCount === 1 ? 's' : ''} input`}>
              {waitingCount}
            </span>
          )}
          <span className="nav-breadcrumb-arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
        </span>
      </button>
      {children}
    </nav>
  );
}
