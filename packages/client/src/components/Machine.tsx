import type { AgentState, MessageState } from '@agent-viewer/shared';

interface MachineProps {
  agents: AgentState[];
  messages: MessageState[];
}

const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  lead:        { x: 450, y: 200 },
  researcher:  { x: 200, y: 120 },
  implementer: { x: 450, y: 380 },
  tester:      { x: 700, y: 380 },
  planner:     { x: 200, y: 380 },
};

const ROLE_COLORS: Record<string, string> = {
  lead: '#FFD700',
  researcher: '#4169E1',
  implementer: '#DC3545',
  tester: '#28A745',
  planner: '#F8F9FA',
};

function getPos(agents: AgentState[], name: string, index: number) {
  const agent = agents.find((a) => a.name === name);
  if (agent && STATION_POSITIONS[agent.role]) {
    return STATION_POSITIONS[agent.role];
  }
  return { x: 200 + index * 180, y: 250 };
}

export function Machine({ agents, messages }: MachineProps) {
  // Draw pipes between agents that have communicated
  const connections = new Map<string, { from: AgentState; to: AgentState }>();

  for (const msg of messages) {
    const key = [msg.from, msg.to].sort().join('-');
    if (!connections.has(key)) {
      const fromAgent = agents.find((a) => a.name === msg.from);
      const toAgent = agents.find((a) => a.name === msg.to);
      if (fromAgent && toAgent) {
        connections.set(key, { from: fromAgent, to: toAgent });
      }
    }
  }

  // Also draw default pipes from lead to all others
  const lead = agents.find((a) => a.role === 'lead');
  if (lead) {
    for (const agent of agents) {
      if (agent.id !== lead.id) {
        const key = [lead.name, agent.name].sort().join('-');
        if (!connections.has(key)) {
          connections.set(key, { from: lead, to: agent });
        }
      }
    }
  }

  const recentMessages = messages.slice(-10);

  return (
    <g>
      {/* Pipe connections */}
      {Array.from(connections.values()).map(({ from, to }, i) => {
        const fromPos = STATION_POSITIONS[from.role] || { x: 450, y: 300 };
        const toPos = STATION_POSITIONS[to.role] || { x: 450, y: 300 };
        const pathId = `pipe-${i}`;

        // Create curved path between stations
        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 - 30;
        const d = `M ${fromPos.x} ${fromPos.y} Q ${mx} ${my} ${toPos.x} ${toPos.y}`;

        return (
          <g key={pathId}>
            {/* Pipe background */}
            <path
              d={d}
              fill="none"
              stroke="#334155"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.5"
            />
            {/* Pipe inner */}
            <path
              d={d}
              fill="none"
              stroke="#1e293b"
              strokeWidth="3"
              strokeLinecap="round"
            />
            {/* Animated conveyor dashes */}
            <path
              id={pathId}
              d={d}
              fill="none"
              stroke="#4169E1"
              strokeWidth="2"
              strokeDasharray="4 8"
              opacity="0.4"
              style={{ animation: 'conveyor-move 1s linear infinite' }}
            />
          </g>
        );
      })}

      {/* Animated data packets for recent messages */}
      {recentMessages.map((msg, i) => {
        const fromAgent = agents.find((a) => a.name === msg.from);
        const toAgent = agents.find((a) => a.name === msg.to);
        if (!fromAgent || !toAgent) return null;

        const fromPos = STATION_POSITIONS[fromAgent.role] || { x: 450, y: 300 };
        const toPos = STATION_POSITIONS[toAgent.role] || { x: 450, y: 300 };
        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 - 30;
        const pathD = `M ${fromPos.x} ${fromPos.y} Q ${mx} ${my} ${toPos.x} ${toPos.y}`;
        const color = ROLE_COLORS[fromAgent.role] || '#FFD700';

        return (
          <g key={`packet-${i}`}>
            <path id={`msg-path-${i}`} d={pathD} fill="none" stroke="none" />
            {/* Lego-like data block */}
            <rect
              width="8"
              height="6"
              rx="1"
              fill={color}
              opacity="0.9"
            >
              <animateMotion
                dur={`${2 + (i % 3)}s`}
                repeatCount="1"
                fill="freeze"
              >
                <mpath href={`#msg-path-${i}`} />
              </animateMotion>
            </rect>
          </g>
        );
      })}

      {/* Gears at agent stations (spinning when working) */}
      {agents.filter((a) => a.status === 'working').map((agent) => {
        const pos = STATION_POSITIONS[agent.role];
        if (!pos) return null;
        const color = ROLE_COLORS[agent.role] || '#FFD700';
        return (
          <g key={`gear-${agent.id}`} transform={`translate(${pos.x + 35}, ${pos.y + 15})`}>
            <g style={{ animation: 'spin 2s linear infinite', transformOrigin: 'center' }}>
              <circle cx="0" cy="0" r="10" fill="none" stroke={color} strokeWidth="2" opacity="0.6" />
              {[0, 60, 120, 180, 240, 300].map((angle) => (
                <line
                  key={angle}
                  x1="0"
                  y1="0"
                  x2={Math.cos((angle * Math.PI) / 180) * 10}
                  y2={Math.sin((angle * Math.PI) / 180) * 10}
                  stroke={color}
                  strokeWidth="2"
                  opacity="0.4"
                />
              ))}
              <circle cx="0" cy="0" r="3" fill={color} opacity="0.8" />
            </g>
          </g>
        );
      })}
    </g>
  );
}
