import type { TaskState, TaskStatus, AgentState } from '@agent-viewer/shared';
import { TASK_CARD, getTaskCardCenter } from './TaskNode';

/** Task status colors */
const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: '#6C757D',
  in_progress: '#4169E1',
  completed: '#28A745',
};

interface TaskDependencyLineProps {
  /** All tasks in the current state */
  tasks: TaskState[];
  /** Map of agentId -> tasks for that agent */
  tasksByAgent: Map<string, TaskState[]>;
  /** Agent positions in the scene */
  positions: Map<string, { x: number; y: number }>;
  /** All agents */
  agents: AgentState[];
}

/** Renders dashed curved lines between tasks that have blockedBy/blocks relationships.
 *  Only draws edges where both task cards are visible in the scene. */
export function TaskDependencyLine({ tasks, tasksByAgent, positions, agents }: TaskDependencyLineProps) {
  // Build map: taskId -> rendered center position
  const taskPositions = new Map<string, { x: number; y: number }>();
  for (const agent of agents) {
    if (agent.isSubagent) continue;
    const agentTasks = tasksByAgent.get(agent.id);
    if (!agentTasks) continue;
    const pos = positions.get(agent.id);
    if (!pos) continue;
    agentTasks.slice(0, TASK_CARD.maxVisible).forEach((task, i) => {
      taskPositions.set(task.id, getTaskCardCenter(pos.x, pos.y, i));
    });
  }

  // Collect dependency edges where both endpoints are visible
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
        // Quadratic Bezier curve arcing above the straight line
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
            {/* Dot at the blocked (destination) end to show direction */}
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
