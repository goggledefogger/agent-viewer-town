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

// Subagent positions fan out around the parent
const SUBAGENT_OFFSETS = [
  { x: 250, y: -20 },
  { x: -250, y: -20 },
  { x: 250, y: 120 },
  { x: -250, y: 120 },
  { x: 0, y: -120 },
];

function getStationPos(agent: AgentState, index: number, isSoloMode: boolean, subagentIndex: number) {
  if (agent.isSubagent && isSoloMode) {
    // Position subagents around the parent
    const offset = SUBAGENT_OFFSETS[subagentIndex % SUBAGENT_OFFSETS.length];
    return { x: SOLO_POSITION.x + offset.x, y: SOLO_POSITION.y + offset.y };
  }
  if (isSoloMode) return SOLO_POSITION;
  return STATION_POSITIONS[agent.role] || { x: 200 + index * 180, y: 250 };
}

/** Prominent alert bubble when agent needs user input */
function WaitingBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  const label = '\u26A0 Needs your input!';
  const subtext = agent.currentAction || 'Waiting for approval';
  const maxLen = 30;
  const displaySub = subtext.length > maxLen ? subtext.slice(0, maxLen - 1) + '\u2026' : subtext;
  const boxWidth = Math.max(140, Math.max(label.length, displaySub.length) * 5.5 + 28);

  return (
    <g transform={`translate(${x}, ${y - 55})`}>
      {/* Pulsing glow behind the bubble */}
      <rect
        x={-boxWidth / 2 - 3}
        y="-20"
        width={boxWidth + 6}
        height="36"
        rx="8"
        fill="#FFD700"
        opacity="0.15"
      >
        <animate attributeName="opacity" values="0.1;0.25;0.1" dur="1.5s" repeatCount="indefinite" />
      </rect>
      {/* Bubble */}
      <rect
        x={-boxWidth / 2}
        y="-18"
        width={boxWidth}
        height="32"
        rx="6"
        fill="#1a1a2e"
        stroke="#FFD700"
        strokeWidth="2"
        opacity="0.97"
      />
      <polygon points="-5,14 5,14 0,20" fill="#1a1a2e" stroke="#FFD700" strokeWidth="2" />
      <rect x="-6" y="12" width="12" height="4" fill="#1a1a2e" />
      {/* Alert text */}
      <text x="0" y="-4" textAnchor="middle" fill="#FFD700" fontSize="8" fontFamily="'Courier New', monospace" fontWeight="bold">
        {label}
        <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite" />
      </text>
      {/* Context */}
      <text x="0" y="8" textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="'Courier New', monospace">
        {displaySub}
      </text>
    </g>
  );
}

/** Speech bubble showing current action — used for all agents */
function ActionBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  // Show prominent alert when waiting for user input (only if not idle)
  if (agent.waitingForInput && agent.status !== 'idle') {
    return <WaitingBubble agent={agent} x={x} y={y} />;
  }

  const isWorking = agent.status === 'working';
  const isDone = agent.status === 'done';
  const text = agent.currentAction || (isWorking ? 'Working...' : (isDone ? 'Done' : ''));
  // Always show something for subagents (their name describes what they're doing)
  if (!text && !isWorking && !agent.isSubagent) return null;
  // For idle subagents with no action, show their name as context
  const displayText = text || (agent.isSubagent ? agent.name : '');

  if (isWorking && !displayText) {
    // Typing dots when working but no specific action
    return (
      <g transform={`translate(${x}, ${y - 50})`}>
        <rect x="-22" y="-12" width="44" height="18" rx="4" fill="#16213e" stroke="#334155" strokeWidth="1" opacity="0.95" />
        <polygon points="-4,6 4,6 0,11" fill="#16213e" stroke="#334155" strokeWidth="1" />
        <rect x="-5" y="5" width="10" height="2" fill="#16213e" />
        {[0, 1, 2].map((dot) => (
          <circle key={dot} cx={-5 + dot * 5} cy="-2" r="1.5" fill="#e2e8f0">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin={`${dot * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }

  const maxLen = 36;
  const display = displayText.length > maxLen ? displayText.slice(0, maxLen - 1) + '\u2026' : displayText;
  const boxWidth = Math.max(80, display.length * 5.2 + 24);

  return (
    <g transform={`translate(${x}, ${y - 50})`}>
      <rect
        x={-boxWidth / 2}
        y="-14"
        width={boxWidth}
        height="22"
        rx="4"
        fill="#16213e"
        stroke="#334155"
        strokeWidth="1"
        opacity="0.95"
      />
      <polygon points="-4,8 4,8 0,13" fill="#16213e" stroke="#334155" strokeWidth="1" />
      <rect x="-5" y="7" width="10" height="2" fill="#16213e" />
      <text x="0" y="0" textAnchor="middle" fill="#e2e8f0" fontSize="7.5" fontFamily="'Courier New', monospace">
        {display}
        {isWorking && (
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
  const mainAgents = state.agents.filter((a) => !a.isSubagent);
  const subagents = state.agents.filter((a) => a.isSubagent);
  // Solo mode: one main agent, possibly with subagents
  const isSoloMode = mainAgents.length <= 1;

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

        {/* Machine connections between agents (team mode or parent+subagents) */}
        {state.agents.length > 1 && <Machine agents={state.agents} messages={state.messages} />}

        {/* Agent characters at their stations */}
        {state.agents.map((agent, i) => {
          const subIdx = agent.isSubagent ? subagents.indexOf(agent) : 0;
          const pos = getStationPos(agent, i, isSoloMode, subIdx);
          const scale = agent.isSubagent ? 0.8 : 1;
          return (
            <g key={agent.id} transform={agent.isSubagent ? `scale(${scale})` : undefined}
               style={agent.isSubagent ? { transformOrigin: `${pos.x}px ${pos.y}px` } : undefined}>
              <AgentCharacter
                agent={agent}
                x={pos.x}
                y={pos.y}
              />
              <ActionBubble agent={agent} x={pos.x} y={pos.y} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
