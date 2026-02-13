import type { AgentState, MessageState } from '@agent-viewer/shared';

interface MachineProps {
  agents: AgentState[];
  messages: MessageState[];
  positions: Map<string, { x: number; y: number }>;
}

const ROLE_COLORS: Record<string, string> = {
  lead: '#FFD700',
  researcher: '#4169E1',
  implementer: '#DC3545',
  tester: '#28A745',
  planner: '#F8F9FA',
};

function GearSvg({ x, y, color, speed }: { x: number; y: number; color: string; speed: number }) {
  const toothCount = 8;
  const outerR = 12;
  const innerR = 8;
  const toothW = 3;
  const duration = Math.max(0.4, speed);

  return (
    <g transform={`translate(${x}, ${y})`}>
      <g style={{
        animation: `spin ${duration}s linear infinite`,
        transformOrigin: '0px 0px',
      }}>
        <circle cx="0" cy="0" r={innerR} fill="none" stroke={color} strokeWidth="2.5" opacity="0.7" />
        {Array.from({ length: toothCount }, (_, i) => {
          const angle = (i / toothCount) * 360;
          return (
            <rect
              key={i}
              x={-toothW / 2}
              y={-outerR}
              width={toothW}
              height={outerR - innerR + 2}
              fill={color}
              opacity="0.6"
              rx="0.5"
              transform={`rotate(${angle})`}
            />
          );
        })}
        <circle cx="0" cy="0" r="3.5" fill={color} opacity="0.8" />
        <circle cx="0" cy="0" r="1.5" fill="#1a1a2e" />
      </g>
    </g>
  );
}

function SmallGear({ x, y, color, speed }: { x: number; y: number; color: string; speed: number }) {
  const duration = Math.max(0.3, speed * 0.7);
  return (
    <g transform={`translate(${x}, ${y})`}>
      <g style={{
        animation: `spin ${duration}s linear infinite reverse`,
        transformOrigin: '0px 0px',
      }}>
        <circle cx="0" cy="0" r="5" fill="none" stroke={color} strokeWidth="1.5" opacity="0.5" />
        {[0, 72, 144, 216, 288].map((angle) => (
          <rect
            key={angle}
            x="-1"
            y="-7"
            width="2"
            height="3"
            fill={color}
            opacity="0.5"
            rx="0.5"
            transform={`rotate(${angle})`}
          />
        ))}
        <circle cx="0" cy="0" r="2" fill={color} opacity="0.7" />
      </g>
    </g>
  );
}

const DEFAULT_POS = { x: 450, y: 300 };

export function Machine({ agents, messages, positions }: MachineProps) {
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

  const isConnectionActive = (from: AgentState, to: AgentState) =>
    from.status === 'working' || to.status === 'working';

  return (
    <g>
      {/* Pipe connections */}
      {Array.from(connections.values()).map(({ from, to }, i) => {
        const fromPos = positions.get(from.id) || DEFAULT_POS;
        const toPos = positions.get(to.id) || DEFAULT_POS;
        const pathId = `pipe-${i}`;
        const active = isConnectionActive(from, to);

        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 - 30;
        const d = `M ${fromPos.x} ${fromPos.y} Q ${mx} ${my} ${toPos.x} ${toPos.y}`;

        return (
          <g key={pathId}>
            <path d={d} fill="none" stroke="#334155" strokeWidth="6" strokeLinecap="round" opacity="0.5" />
            <path d={d} fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
            <path
              id={pathId}
              d={d}
              fill="none"
              stroke={active ? '#4169E1' : '#334155'}
              strokeWidth="2"
              strokeDasharray="4 8"
              opacity={active ? 0.6 : 0.25}
              markerEnd={active ? 'url(#pipeArrow)' : 'url(#pipeArrowIdle)'}
              style={{ animation: `conveyor-move ${active ? '0.6s' : '2s'} linear infinite` }}
            />
            {active && (
              <path
                d={d}
                fill="none"
                stroke="#FFD700"
                strokeWidth="1"
                strokeDasharray="2 14"
                opacity="0.3"
                style={{ animation: 'conveyor-move 0.8s linear infinite' }}
              />
            )}
          </g>
        );
      })}

      {/* Animated data packets for recent messages */}
      {recentMessages.map((msg, i) => {
        const fromAgent = agents.find((a) => a.name === msg.from);
        const toAgent = agents.find((a) => a.name === msg.to);
        if (!fromAgent || !toAgent) return null;

        const fromPos = positions.get(fromAgent.id) || DEFAULT_POS;
        const toPos = positions.get(toAgent.id) || DEFAULT_POS;
        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 - 30;
        const pathD = `M ${fromPos.x} ${fromPos.y} Q ${mx} ${my} ${toPos.x} ${toPos.y}`;
        const color = ROLE_COLORS[fromAgent.role] || '#FFD700';
        const dur = 2 + (i % 3);

        return (
          <g key={`packet-${i}`}>
            <path id={`msg-path-${i}`} d={pathD} fill="none" stroke="none" />
            <g>
              {/* Glow behind packet */}
              <rect width="10" height="8" rx="1" fill={color} opacity="0.3">
                <animateMotion dur={`${dur}s`} repeatCount="1" fill="freeze">
                  <mpath href={`#msg-path-${i}`} />
                </animateMotion>
              </rect>
              {/* Lego block packet */}
              <rect width="8" height="6" rx="1" fill={color} opacity="0.9">
                <animateMotion dur={`${dur}s`} repeatCount="1" fill="freeze">
                  <mpath href={`#msg-path-${i}`} />
                </animateMotion>
              </rect>
              {/* Lego stud on top */}
              <rect width="4" height="2" rx="0.5" fill={color} opacity="0.7" x="2" y="-2">
                <animateMotion dur={`${dur}s`} repeatCount="1" fill="freeze">
                  <mpath href={`#msg-path-${i}`} />
                </animateMotion>
              </rect>
            </g>
          </g>
        );
      })}

      {/* Interlocking gears at working agent stations */}
      {agents.filter((a) => a.status === 'working').map((agent) => {
        const pos = positions.get(agent.id);
        if (!pos) return null;
        const color = ROLE_COLORS[agent.role] || '#FFD700';
        const gearSpeed = Math.max(0.5, 2.5 - agent.tasksCompleted * 0.3);

        return (
          <g key={`gear-${agent.id}`}>
            <GearSvg x={pos.x + 38} y={pos.y + 15} color={color} speed={gearSpeed} />
            <SmallGear x={pos.x + 50} y={pos.y + 8} color={color} speed={gearSpeed} />
          </g>
        );
      })}

      {/* SVG markers and filters */}
      <defs>
        <marker id="pipeArrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#4169E1" opacity="0.5" />
        </marker>
        <marker id="pipeArrowIdle" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto">
          <path d="M 0 0 L 6 3 L 0 6 z" fill="#334155" opacity="0.3" />
        </marker>
        <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
}
