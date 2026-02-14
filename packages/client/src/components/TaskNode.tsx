import type { TaskState, TaskStatus } from '@agent-viewer/shared';

/** Task status colors matching CSS variables */
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6C757D',
  in_progress: '#4169E1',
  completed: '#28A745',
};

/** SVG task card dimensions */
export const TASK_CARD = {
  width: 22,
  height: 28,
  clipWidth: 10,
  clipHeight: 4,
  dotRadius: 2.5,
  stackGap: 4,
  maxVisible: 3,
};

/** A single clipboard-style task card (22x28px pixel art) */
function ClipboardCard({
  task,
  offsetY,
  shared,
  onClick,
}: {
  task: TaskState;
  offsetY: number;
  shared?: number;
  onClick?: (task: TaskState) => void;
}) {
  const color = STATUS_COLORS[task.status];
  const isActive = task.status === 'in_progress';
  const isDone = task.status === 'completed';

  return (
    <g
      transform={`translate(0, ${offsetY})`}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(task); } : undefined}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {/* Card background */}
      <rect
        x="0"
        y="0"
        width={TASK_CARD.width}
        height={TASK_CARD.height}
        rx="2"
        fill="#16213e"
        stroke={color}
        strokeWidth={isActive ? 1.5 : 1}
      />
      {/* Gold clip at top */}
      <rect
        x={(TASK_CARD.width - TASK_CARD.clipWidth) / 2}
        y={-TASK_CARD.clipHeight / 2}
        width={TASK_CARD.clipWidth}
        height={TASK_CARD.clipHeight}
        rx="1"
        fill="#FFD700"
      />
      {/* Task ID */}
      <text
        x={TASK_CARD.width / 2}
        y="12"
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize="7"
        fontFamily="'Courier New', monospace"
      >
        #{task.id}
      </text>
      {/* Status indicator */}
      {isDone ? (
        <path
          d={`M${TASK_CARD.width / 2 - 4},${TASK_CARD.height - 8} L${TASK_CARD.width / 2 - 1},${TASK_CARD.height - 5} L${TASK_CARD.width / 2 + 4},${TASK_CARD.height - 11}`}
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="square"
        />
      ) : (
        <circle cx={TASK_CARD.width / 2} cy={TASK_CARD.height - 8} r={TASK_CARD.dotRadius} fill={color}>
          {isActive && (
            <animate
              attributeName="opacity"
              values="0.5;1;0.5"
              dur="1.5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
      )}
      {/* Shared-task badge: shows how many agents work on this task */}
      {shared != null && shared > 1 && (
        <g transform={`translate(${TASK_CARD.width - 2}, -2)`}>
          <circle cx="0" cy="0" r="5" fill="#0f3460" stroke={color} strokeWidth="0.5" />
          <text
            x="0"
            y="3"
            textAnchor="middle"
            fill={color}
            fontSize="5.5"
            fontFamily="'Courier New', monospace"
            fontWeight="bold"
          >
            {shared}
          </text>
        </g>
      )}
    </g>
  );
}

export interface TaskNodeProps {
  /** Tasks assigned to this agent */
  tasks: TaskState[];
  /** Agent position in the scene */
  agentX: number;
  agentY: number;
  /** Map of taskId -> number of agents sharing that task */
  sharedCounts?: Map<string, number>;
  /** Callback when a task card is clicked */
  onTaskClick?: (task: TaskState) => void;
}

/** Renders clipboard-style task cards next to an agent in the SVG scene */
export function TaskNode({ tasks, agentX, agentY, sharedCounts, onTaskClick }: TaskNodeProps) {
  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, TASK_CARD.maxVisible);
  const overflow = tasks.length - TASK_CARD.maxVisible;

  // Position cards to the right of agent, clamped to viewport
  const cardGroupX = Math.min(agentX + 35, 870);
  const cardGroupY = agentY + 12;
  // Connection line from agent platform edge to card group
  const lineStartX = agentX + 30;
  const lineStartY = agentY + 20;
  const firstTaskColor = STATUS_COLORS[visible[0].status];
  const firstIsActive = visible[0].status === 'in_progress';

  return (
    <g>
      {/* Connection line from agent to task cards */}
      <line
        x1={lineStartX}
        y1={lineStartY}
        x2={cardGroupX}
        y2={cardGroupY + TASK_CARD.height / 2}
        stroke={firstTaskColor}
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity={firstIsActive ? 0.4 : 0.2}
        style={firstIsActive ? { animation: 'conveyor-move 0.6s linear infinite' } : undefined}
      />
      {/* Stacked task cards */}
      <g transform={`translate(${cardGroupX}, ${cardGroupY})`}>
        {visible.map((task, i) => (
          <ClipboardCard
            key={task.id}
            task={task}
            offsetY={i * (TASK_CARD.height + TASK_CARD.stackGap)}
            shared={sharedCounts?.get(task.id)}
            onClick={onTaskClick}
          />
        ))}
        {/* Overflow indicator */}
        {overflow > 0 && (
          <text
            x={TASK_CARD.width / 2}
            y={visible.length * (TASK_CARD.height + TASK_CARD.stackGap) + 6}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="6"
            fontFamily="'Courier New', monospace"
          >
            +{overflow}
          </text>
        )}
      </g>
    </g>
  );
}

/** Get the rendered center position of a task card given its agent position and index */
export function getTaskCardCenter(
  agentX: number,
  agentY: number,
  cardIndex: number,
): { x: number; y: number } {
  const cardGroupX = Math.min(agentX + 35, 870);
  const cardGroupY = agentY + 12;
  return {
    x: cardGroupX + TASK_CARD.width / 2,
    y: cardGroupY + cardIndex * (TASK_CARD.height + TASK_CARD.stackGap) + TASK_CARD.height / 2,
  };
}
