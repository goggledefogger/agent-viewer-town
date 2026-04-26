import { useMemo } from 'react';
import type { DashboardPanel } from '../hooks/useDashboard';
import { DashboardCell } from './DashboardCell';

interface DashboardGridProps {
  panels: DashboardPanel[];
  onFocusPanel: (sessionId: string) => void;
  onRemovePanel: (sessionId: string) => void;
}

/**
 * Compute the optimal grid layout for N panels.
 *
 * Strategy:
 * - 1 panel: 1 column (full width)
 * - 2 panels: 2 columns side-by-side (landscape friendly)
 * - 3-4 panels: 2 columns
 * - 5-6 panels: 3 columns
 * - 7-9 panels: 3 columns
 * - 10+: 4 columns
 *
 * Panels maintain their insertion order (stable positioning).
 * When a panel is removed, remaining panels don't shift around
 * because CSS grid handles sparse placement naturally.
 */
function getGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

export function DashboardGrid({ panels, onFocusPanel, onRemovePanel }: DashboardGridProps) {
  const columns = useMemo(() => getGridColumns(panels.length), [panels.length]);

  if (panels.length === 0) {
    return (
      <div className="dashboard-empty">
        <p>No panels active. Toggle dashboard mode to view all sessions.</p>
      </div>
    );
  }

  return (
    <div
      className="dashboard-grid"
      style={{
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
      }}
    >
      {panels.map((panel) => (
        <DashboardCell
          key={panel.sessionId}
          sessionId={panel.sessionId}
          state={panel.state}
          onFocus={onFocusPanel}
          onRemove={onRemovePanel}
        />
      ))}
    </div>
  );
}
