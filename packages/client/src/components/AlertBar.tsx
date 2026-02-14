import type { AgentState } from '@agent-viewer/shared';

interface AlertBarProps {
  /** Agents currently waiting for user input */
  waitingAgents: AgentState[];
  /** Callback when user clicks an agent name to focus it */
  onFocusAgent?: (agentId: string) => void;
}

/**
 * Full-width alert bar rendered above the header when any agent
 * is waiting for user input. Pulsing gold/red background with
 * agent name and action, clickable to focus the agent.
 */
export function AlertBar({ waitingAgents, onFocusAgent }: AlertBarProps) {
  if (waitingAgents.length === 0) return null;

  const isCritical = waitingAgents.length >= 3;

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
      </div>
      <div className="alert-bar-badge">{waitingAgents.length}</div>
    </div>
  );
}
