import type { AgentState } from '@agent-viewer/shared';
import { Beaver } from '../svg/animals/Beaver';
import { Owl } from '../svg/animals/Owl';
import { Fox } from '../svg/animals/Fox';
import { Bear } from '../svg/animals/Bear';
import { Rabbit } from '../svg/animals/Rabbit';

interface AgentCharacterProps {
  agent: AgentState;
  x: number;
  y: number;
}

const ROLE_COLORS: Record<string, string> = {
  lead: '#FFD700',
  researcher: '#4169E1',
  implementer: '#DC3545',
  tester: '#28A745',
  planner: '#F8F9FA',
};

const ANIMAL_COMPONENTS: Record<string, React.FC<{ stage: number }>> = {
  lead: Beaver,
  researcher: Owl,
  implementer: Fox,
  tester: Bear,
  planner: Rabbit,
};

function getEvolutionStage(tasksCompleted: number): number {
  if (tasksCompleted >= 6) return 3;
  if (tasksCompleted >= 3) return 2;
  return 1;
}

export function AgentCharacter({ agent, x, y }: AgentCharacterProps) {
  const color = ROLE_COLORS[agent.role] || '#FFD700';
  const stage = getEvolutionStage(agent.tasksCompleted);
  const AnimalSvg = ANIMAL_COMPONENTS[agent.role] || Beaver;
  const isWorking = agent.status === 'working';

  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Workstation platform */}
      <rect x="-30" y="20" width="60" height="8" fill="#5a3a1a" rx="2" />
      <rect x="-26" y="16" width="52" height="8" fill="#7a5a3a" rx="2" />

      {/* Evolution glow */}
      {stage >= 2 && (
        <circle
          cx="0"
          cy="0"
          r={stage >= 3 ? 28 : 22}
          fill="none"
          stroke={color}
          strokeWidth="1"
          opacity={0.3}
          className="agent-evolved"
        />
      )}

      {/* Animal character */}
      <g className={isWorking ? 'agent-working' : 'agent-idle'}>
        <AnimalSvg stage={stage} />
      </g>

      {/* Working gear indicator */}
      {isWorking && (
        <g transform="translate(22, -10)" className="agent-working">
          <circle cx="0" cy="0" r="6" fill="none" stroke={color} strokeWidth="1.5" className="gear" />
          <circle cx="0" cy="0" r="2" fill={color} className="gear" />
        </g>
      )}

      {/* Name label */}
      <text
        x="0"
        y="38"
        textAnchor="middle"
        fill={color}
        fontSize="9"
        fontFamily="'Courier New', monospace"
        fontWeight="bold"
      >
        {agent.name}
      </text>

      {/* Current action speech bubble */}
      {agent.currentAction && (
        <g transform="translate(0, -40)">
          <rect x="-50" y="-12" width="100" height="18" rx="4" fill="#16213e" stroke="#334155" strokeWidth="1" />
          <polygon points="-4,6 4,6 0,12" fill="#16213e" stroke="#334155" strokeWidth="1" />
          <text
            x="0"
            y="1"
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize="8"
            fontFamily="'Courier New', monospace"
          >
            {agent.currentAction.slice(0, 18)}
          </text>
        </g>
      )}
    </g>
  );
}
