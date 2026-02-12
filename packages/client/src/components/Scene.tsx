import type { TeamState } from '@agent-viewer/shared';
import { AgentCharacter } from './AgentCharacter';
import { Machine } from './Machine';

interface SceneProps {
  state: TeamState;
}

// Layout positions for agent workstations
const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  lead:        { x: 450, y: 200 },
  researcher:  { x: 200, y: 120 },
  implementer: { x: 450, y: 380 },
  tester:      { x: 700, y: 380 },
  planner:     { x: 200, y: 380 },
};

function getStationPos(role: string, index: number) {
  return STATION_POSITIONS[role] || { x: 200 + index * 180, y: 250 };
}

export function Scene({ state }: SceneProps) {
  if (!state.name) {
    return (
      <div className="scene-container no-team">
        <h2>The Workshop in the Woods</h2>
        <p>Waiting for an agent team to start...<br />
        Use <code>TeamCreate</code> in Claude Code to begin.</p>
      </div>
    );
  }

  return (
    <div className="scene-container">
      <svg
        viewBox="0 0 900 600"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ background: 'var(--color-bg)' }}
      >
        {/* Sky gradient */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="60%" stopColor="#16213e" />
            <stop offset="100%" stopColor="#0f3460" />
          </linearGradient>
        </defs>
        <rect width="900" height="600" fill="url(#skyGrad)" />

        {/* Ground */}
        <rect x="0" y="480" width="900" height="120" fill="#2d5a27" rx="0" />
        <rect x="0" y="480" width="900" height="4" fill="#4a6741" />

        {/* Trees (background decoration) */}
        <g opacity="0.6">
          {[50, 150, 780, 860].map((tx, i) => (
            <g key={i} transform={`translate(${tx}, 440)`}>
              <rect x="-4" y="0" width="8" height="40" fill="#5a3a1a" />
              <polygon points="-20,-5 0,-40 20,-5" fill="#2d5a27" />
              <polygon points="-15,-20 0,-50 15,-20" fill="#3a7a34" />
            </g>
          ))}
        </g>

        {/* Stars */}
        {[
          [80, 40], [200, 60], [340, 30], [500, 50], [650, 35], [780, 55],
          [120, 90], [400, 80], [600, 70], [720, 45],
        ].map(([sx, sy], i) => (
          <rect key={i} x={sx} y={sy} width="2" height="2" fill="#ffffff" opacity={0.4 + (i % 3) * 0.2} />
        ))}

        {/* Machine connections between agents */}
        <Machine agents={state.agents} messages={state.messages} />

        {/* Agent characters at their stations */}
        {state.agents.map((agent, i) => {
          const pos = getStationPos(agent.role, i);
          return (
            <AgentCharacter
              key={agent.id}
              agent={agent}
              x={pos.x}
              y={pos.y}
            />
          );
        })}
      </svg>
    </div>
  );
}
