import { useState } from 'react';
import type { TeamState, AgentState } from '@agent-viewer/shared';
import { AgentCharacter } from './AgentCharacter';
import { Machine } from './Machine';

interface SceneProps {
  state: TeamState;
}

// Layout positions for agent workstations (team mode)
const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  lead:        { x: 450, y: 200 },
  researcher:  { x: 200, y: 120 },
  implementer: { x: 450, y: 380 },
  tester:      { x: 700, y: 380 },
  planner:     { x: 200, y: 380 },
};

// Center position for solo agent
const SOLO_POSITION = { x: 450, y: 300 };

function getStationPos(role: string, index: number, isSolo: boolean) {
  if (isSolo) return SOLO_POSITION;
  return STATION_POSITIONS[role] || { x: 200 + index * 180, y: 250 };
}

function AgentTooltip({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y - 65})`}>
      <rect
        x="-70"
        y="-40"
        width="140"
        height="52"
        rx="6"
        fill="#16213e"
        stroke="#4169E1"
        strokeWidth="1.5"
        opacity="0.95"
      />
      <text x="0" y="-24" textAnchor="middle" fill="#FFD700" fontSize="9" fontFamily="'Courier New', monospace" fontWeight="bold">
        {agent.name}
      </text>
      <text x="0" y="-12" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="'Courier New', monospace">
        Role: {agent.role} | {agent.status}
      </text>
      <text x="0" y="0" textAnchor="middle" fill="#28A745" fontSize="8" fontFamily="'Courier New', monospace">
        Tasks done: {agent.tasksCompleted}
      </text>
    </g>
  );
}

/** Speech bubble for solo agent showing current action */
function SoloSpeechBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  const text = agent.currentAction || (agent.status === 'working' ? 'Working...' : 'Idle');
  const maxLen = 30;
  const display = text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
  const boxWidth = Math.max(80, display.length * 6.5 + 24);

  return (
    <g transform={`translate(${x}, ${y - 60})`}>
      <rect
        x={-boxWidth / 2}
        y="-16"
        width={boxWidth}
        height="24"
        rx="6"
        fill="#16213e"
        stroke="#4169E1"
        strokeWidth="1.5"
        opacity="0.95"
      />
      <polygon points="-5,8 5,8 0,14" fill="#16213e" stroke="#4169E1" strokeWidth="1.5" />
      {/* Cover the stroke line inside the bubble where the pointer meets */}
      <rect x="-6" y="6" width="12" height="3" fill="#16213e" />
      <text x="0" y="0" textAnchor="middle" fill="#e2e8f0" fontSize="9" fontFamily="'Courier New', monospace">
        {display}
        {agent.status === 'working' && (
          <tspan fill="#e2e8f0">
            <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
            {'_'}
          </tspan>
        )}
      </text>
    </g>
  );
}

export function Scene({ state }: SceneProps) {
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const isSolo = state.agents.length === 1;

  if (!state.name && state.agents.length === 0) {
    return (
      <div className="scene-container no-team">
        <h2>The Workshop in the Woods</h2>
        <p>Waiting for a session to start...<br />
        Launch Claude Code to begin.</p>
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

        {/* Machine connections between agents (only for team mode) */}
        {!isSolo && <Machine agents={state.agents} messages={state.messages} />}

        {/* Agent characters at their stations */}
        {state.agents.map((agent, i) => {
          const pos = getStationPos(agent.role, i, isSolo);
          return (
            <g
              key={agent.id}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              style={{ cursor: 'pointer' }}
            >
              <AgentCharacter
                agent={agent}
                x={pos.x}
                y={pos.y}
              />
              {/* Solo mode: always show speech bubble */}
              {isSolo && <SoloSpeechBubble agent={agent} x={pos.x} y={pos.y} />}
              {/* Team mode: show tooltip on hover */}
              {!isSolo && hoveredAgent === agent.id && (
                <AgentTooltip agent={agent} x={pos.x} y={pos.y} />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
