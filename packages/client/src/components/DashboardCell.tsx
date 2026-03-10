import type { TeamState } from '@agent-viewer/shared';
import { Scene } from './Scene';

interface DashboardCellProps {
  sessionId: string;
  state: TeamState;
  onFocus: (sessionId: string) => void;
  onRemove: (sessionId: string) => void;
}

export function DashboardCell({ sessionId, state, onFocus, onRemove }: DashboardCellProps) {
  const session = state.session;
  const agentCount = state.agents.length;
  const hasWaiting = state.agents.some((a) => a.waitingForInput);

  const label = session
    ? `${session.projectName}${session.gitBranch ? ` (${session.gitBranch})` : ''}`
    : 'Loading...';

  return (
    <div
      className={`dashboard-cell${hasWaiting ? ' dashboard-cell-waiting' : ''}`}
      onDoubleClick={() => onFocus(sessionId)}
    >
      <div className="dashboard-cell-header">
        <span className="dashboard-cell-label" title={label}>
          {label}
        </span>
        <span className="dashboard-cell-meta">
          {agentCount > 0 && (
            <span className="dashboard-cell-agents">
              {agentCount} {agentCount === 1 ? 'agent' : 'agents'}
            </span>
          )}
          {hasWaiting && <span className="dashboard-cell-waiting-badge">!</span>}
        </span>
        <button
          className="dashboard-cell-close"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(sessionId);
          }}
          title="Remove panel"
        >
          x
        </button>
      </div>
      <div className="dashboard-cell-scene">
        <Scene state={state} />
      </div>
    </div>
  );
}
