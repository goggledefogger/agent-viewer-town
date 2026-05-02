import type { AgentState, SessionListEntry } from '@agent-viewer/shared';

interface AlertBarProps {
  /** Agents currently waiting for user input in the active session */
  waitingAgents: AgentState[];
  /** Callback when user clicks an agent name to focus it */
  onFocusAgent?: (agentId: string) => void;
  /** All sessions (to detect cross-session waiting) */
  sessions?: SessionListEntry[];
  /** The active session ID (to exclude from cross-session list) */
  activeSessionId?: string;
  /** Callback when user clicks a cross-session entry to switch to it */
  onSelectSession?: (sessionId: string) => void;
}

/**
 * Full-width alert bar rendered above the header when any agent
 * is waiting for user input. Shows both current-session agents and
 * a secondary row for agents in other projects needing input.
 */
export function AlertBar({ waitingAgents, onFocusAgent, sessions, activeSessionId, onSelectSession }: AlertBarProps) {
  // Cross-session waiting: other projects with agents needing input
  const crossSessionWaiting = (sessions ?? []).filter(
    (s) => s.hasWaitingAgent && s.sessionId !== activeSessionId
  );

  const hasCurrentWaiting = waitingAgents.length > 0;
  const hasCrossWaiting = crossSessionWaiting.length > 0;

  if (!hasCurrentWaiting && !hasCrossWaiting) return null;

  const totalWaiting = waitingAgents.length + crossSessionWaiting.length;
  const isCritical = totalWaiting >= 3;

  return (
    <div className={`alert-bar ${isCritical ? 'alert-bar-critical' : ''}`}>
      <div className="alert-bar-icon">
        <svg width="14" height="14" viewBox="0 0 14 14">
          <path
            d="M7 1 L13 12 H1 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <text x="7" y="11" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="bold" fontFamily="monospace">!</text>
        </svg>
      </div>
      <div className="alert-bar-content">
        {/* Current-session agents */}
        {hasCurrentWaiting && (
          <span className="alert-bar-row">
            {waitingAgents.length === 1 ? (
              <span>
                <button
                  className="alert-bar-agent"
                  onClick={() => onFocusAgent?.(waitingAgents[0].id)}
                >
                  {waitingAgents[0].name}
                </button>
                {' '}needs input: {waitingAgents[0].currentAction || 'Waiting for approval'}
              </span>
            ) : (
              <span>
                <strong>{waitingAgents.length} agents</strong> need input:{' '}
                {waitingAgents.map((agent, i) => (
                  <span key={agent.id}>
                    {i > 0 && ', '}
                    <button
                      className="alert-bar-agent"
                      onClick={() => onFocusAgent?.(agent.id)}
                    >
                      {agent.name}
                    </button>
                  </span>
                ))}
              </span>
            )}
          </span>
        )}

        {/* Cross-session agents from other projects */}
        {hasCrossWaiting && (
          <span className={`alert-bar-row alert-bar-cross-session ${hasCurrentWaiting ? 'alert-bar-row-secondary' : ''}`}>
            {crossSessionWaiting.map((s, i) => {
              const info = s.waitingAgentInfo;
              const label = info
                ? `${s.projectName}${s.gitBranch ? ` (${s.gitBranch})` : ''}`
                : s.projectName;
              return (
                <span key={s.sessionId}>
                  {i > 0 && <span className="alert-bar-separator">·</span>}
                  <button
                    className="alert-bar-agent alert-bar-agent-external"
                    onClick={() => onSelectSession?.(s.sessionId)}
                    title={info ? `${info.agentName}: ${info.action}` : `Switch to ${s.projectName}`}
                  >
                    ↗ {label}
                  </button>
                  {info && <span className="alert-bar-ext-action"> needs input</span>}
                </span>
              );
            })}
          </span>
        )}
      </div>
      <div className="alert-bar-badge">{totalWaiting}</div>
    </div>
  );
}
