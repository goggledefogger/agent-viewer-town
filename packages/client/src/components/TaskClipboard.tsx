import type { TaskState, TaskStatus, AgentState } from '@agent-viewer/shared';

/** Task status colors matching CSS variables */
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6C757D',
  in_progress: '#4169E1',
  completed: '#28A745',
};

/** SVG task card dimensions */
const CARD = {
  width: 22,
  height: 28,
  clipWidth: 10,
  clipHeight: 4,
  dotRadius: 2.5,
  stackGap: 4,
  maxVisible: 3,
};

/** A single clipboard-style task card */
function ClipboardCard({
  task,
  offsetY,
  shared,
  onClick,
}: {
  task: TaskState;
  offsetY: number;
  /** Number of agents sharing this task (show badge if > 1) */
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
        width={CARD.width}
        height={CARD.height}
        rx="2"
        fill="#16213e"
        stroke={color}
        strokeWidth={isActive ? 1.5 : 1}
      />
      {/* Gold clip at top */}
      <rect
        x={(CARD.width - CARD.clipWidth) / 2}
        y={-CARD.clipHeight / 2}
        width={CARD.clipWidth}
        height={CARD.clipHeight}
        rx="1"
        fill="#FFD700"
      />
      {/* Task ID */}
      <text
        x={CARD.width / 2}
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
          d={`M${CARD.width / 2 - 4},${CARD.height - 8} L${CARD.width / 2 - 1},${CARD.height - 5} L${CARD.width / 2 + 4},${CARD.height - 11}`}
          stroke={color}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="square"
        />
      ) : (
        <circle cx={CARD.width / 2} cy={CARD.height - 8} r={CARD.dotRadius} fill={color}>
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
        <g transform={`translate(${CARD.width - 2}, -2)`}>
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

interface TaskClipboardProps {
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
export function TaskClipboard({ tasks, agentX, agentY, sharedCounts, onTaskClick }: TaskClipboardProps) {
  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, CARD.maxVisible);
  const overflow = tasks.length - CARD.maxVisible;

  // Position cards to the right of agent, but clamp to viewport
  const cardGroupX = Math.min(agentX + 50, 870);
  const cardGroupY = agentY + 6;
  // Connection line from agent platform edge to card group
  const lineStartX = agentX + 30;
  const lineStartY = agentY + 20;
  const firstTaskColor = STATUS_COLORS[visible[0].status];
  const firstIsActive = visible[0].status === 'in_progress';

  return (
    <g>
      {/* Connection line */}
      <line
        x1={lineStartX}
        y1={lineStartY}
        x2={cardGroupX}
        y2={cardGroupY + CARD.height / 2}
        stroke={firstTaskColor}
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity={firstIsActive ? 0.4 : 0.2}
        style={firstIsActive ? { animation: 'conveyor-move 0.6s linear infinite' } : undefined}
      />
      {/* Task cards */}
      <g transform={`translate(${cardGroupX}, ${cardGroupY})`}>
        {visible.map((task, i) => (
          <ClipboardCard
            key={task.id}
            task={task}
            offsetY={i * (CARD.height + CARD.stackGap)}
            shared={sharedCounts?.get(task.id)}
            onClick={onTaskClick}
          />
        ))}
        {/* Overflow indicator */}
        {overflow > 0 && (
          <text
            x={CARD.width / 2}
            y={visible.length * (CARD.height + CARD.stackGap) + 6}
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

/** Get the rendered center position of a task card given the agent position and card index */
export function getTaskCardCenter(
  agentX: number,
  agentY: number,
  cardIndex: number,
): { x: number; y: number } {
  const cardGroupX = Math.min(agentX + 50, 870);
  const cardGroupY = agentY + 6;
  return {
    x: cardGroupX + CARD.width / 2,
    y: cardGroupY + cardIndex * (CARD.height + CARD.stackGap) + CARD.height / 2,
  };
}

interface TaskDependencyLinesProps {
  /** All tasks in the current state */
  tasks: TaskState[];
  /** Map of agentId -> tasks for that agent */
  tasksByAgent: Map<string, TaskState[]>;
  /** Agent positions */
  positions: Map<string, { x: number; y: number }>;
  /** All agents */
  agents: AgentState[];
}

/** Renders dashed lines between tasks that have dependency relationships (blockedBy/blocks) */
export function TaskDependencyLines({ tasks, tasksByAgent, positions, agents }: TaskDependencyLinesProps) {
  // Build a map: taskId -> { agentId, cardIndex } for rendered tasks
  const taskPositions = new Map<string, { x: number; y: number }>();
  for (const agent of agents) {
    if (agent.isSubagent) continue;
    const agentTasks = tasksByAgent.get(agent.id);
    if (!agentTasks) continue;
    const pos = positions.get(agent.id);
    if (!pos) continue;
    agentTasks.slice(0, CARD.maxVisible).forEach((task, i) => {
      taskPositions.set(task.id, getTaskCardCenter(pos.x, pos.y, i));
    });
  }

  // Find dependency edges where both endpoints are visible
  const edges: Array<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    color: string;
  }> = [];

  for (const task of tasks) {
    const toPos = taskPositions.get(task.id);
    if (!toPos) continue;
    for (const blockerId of task.blockedBy) {
      const fromPos = taskPositions.get(blockerId);
      if (!fromPos) continue;
      const blocker = tasks.find((t) => t.id === blockerId);
      const color = blocker ? STATUS_COLORS[blocker.status] : '#334155';
      edges.push({ from: fromPos, to: toPos, color });
    }
  }

  if (edges.length === 0) return null;

  return (
    <g>
      {edges.map((edge, i) => {
        const mx = (edge.from.x + edge.to.x) / 2;
        const my = (edge.from.y + edge.to.y) / 2 - 15;
        const d = `M ${edge.from.x} ${edge.from.y} Q ${mx} ${my} ${edge.to.x} ${edge.to.y}`;
        return (
          <g key={`dep-${i}`}>
            <path
              d={d}
              fill="none"
              stroke={edge.color}
              strokeWidth="1"
              strokeDasharray="3 5"
              opacity="0.25"
            />
            {/* Arrow at the "to" end */}
            <circle
              cx={edge.to.x}
              cy={edge.to.y}
              r="2"
              fill={edge.color}
              opacity="0.4"
            />
          </g>
        );
      })}
    </g>
  );
}
