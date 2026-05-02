import type { ReactNode } from 'react';
import type { BreadcrumbSegment } from '../hooks/useNavigation';

interface BreadcrumbProps {
  segments: BreadcrumbSegment[];
  onToggleDropdown: () => void;
  onZoomTo: (level: ZoomLevel, projectKey?: string, branch?: string) => void;
  waitingCount: number;
  isOpen: boolean;
  children?: ReactNode;
}

export function Breadcrumb({
  segments,
  onToggleDropdown,
  onZoomTo,
  waitingCount,
  isOpen,
  children,
}: BreadcrumbProps) {
  return (
    <nav className="nav-breadcrumb" aria-label="Session navigation">
      <div
        className={`nav-breadcrumb-trigger ${isOpen ? 'open' : ''}`}
        onClick={(e) => {
          // Only toggle if we didn't click a segment link
          if (!(e.target as HTMLElement).closest('.nav-breadcrumb-link')) {
            onToggleDropdown();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleDropdown();
          }
        }}
      >
        <span className="nav-breadcrumb-segments">
          {segments.map((seg, idx) => (
            <span key={`${seg.label}-${seg.level}`} className="nav-breadcrumb-segment-wrapper">
              {idx > 0 && <span className="nav-breadcrumb-sep">&gt;</span>}
              {seg.isCurrent ? (
                <span className="nav-breadcrumb-current">{seg.label}</span>
              ) : (
                <button
                  className="nav-breadcrumb-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onZoomTo(seg.level, seg.projectKey, seg.branch);
                    // Ensure it's open if we're clicking a breadcrumb
                    if (!isOpen) onToggleDropdown();
                  }}
                  title={`Go back to ${seg.label}`}
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
      </div>
      {children}
    </nav>
  );
}
