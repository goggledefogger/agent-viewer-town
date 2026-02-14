import { useEffect, useRef } from 'react';
import type { TaskState, AgentState } from '@agent-viewer/shared';
import { ROLE_COLORS } from '../constants/colors';

interface TaskBoardProps {
  tasks: TaskState[];
  agents: AgentState[];
  onFocusAgent?: (agentId: string) => void;
  onFocusTask?: (taskId: string) => void;
  highlightTaskId?: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '\u25CB',
  in_progress: '\u2699',
  completed: '\u2713',
};

const ROLE_ANIMALS: Record<string, string> = {
  lead: '\u{1F9AB}',
  researcher: '\u{1F989}',
  implementer: '\u{1F98A}',
  tester: '\u{1F43B}',
  planner: '\u{1F407}',
};

function AgentAvatar({ agent }: { agent: AgentState }) {
  const animal = ROLE_ANIMALS[agent.role] || '\u{1F9AB}';
  const color = ROLE_COLORS[agent.role] || '#FFD700';
  return (
    <span className="agent-avatar" style={{ borderColor: color }}>
      {animal}
    </span>
  );
}

function TaskRef({ taskId, onFocusTask }: { taskId: string; onFocusTask?: (id: string) => void }) {
  if (!onFocusTask) return <span>#{taskId}</span>;
  return (
    <button className="task-link" onClick={() => onFocusTask(taskId)}>
      #{taskId}
    </button>
  );
}

export function TaskBoard({ tasks, agents, onFocusAgent, onFocusTask, highlightTaskId }: TaskBoardProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightTaskId) return;
    const el = highlightRef.current;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightTaskId]);

  if (tasks.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
        No tasks yet
      </div>
    );
  }

  const sorted = [...tasks].sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, pending: 1, completed: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  const busyAgents = new Set(
    agents.filter((a) => a.status === 'working').map((a) => a.name)
  );

  const blocksMap = new Map<string, string[]>();
  for (const task of tasks) {
    for (const blockedById of task.blockedBy) {
      const existing = blocksMap.get(blockedById) || [];
      existing.push(task.id);
      blocksMap.set(blockedById, existing);
    }
  }

  return (
    <div>
      {sorted.map((task) => {
        const owner = agents.find((a) => a.name === task.owner);
        const isTapped = task.owner ? busyAgents.has(task.owner) && task.status === 'in_progress' : false;
        const blocksOthers = blocksMap.get(task.id);
        const isHighlighted = highlightTaskId === task.id;

        return (
          <div
            key={task.id}
            ref={isHighlighted ? highlightRef : undefined}
            data-task-id={task.id}
            className={`task-card ${task.status} ${isTapped ? 'tapped' : ''} ${isHighlighted ? 'highlighted' : ''}`}
          >
            <div className="task-id">
              <TaskRef taskId={task.id} onFocusTask={onFocusTask} /> {STATUS_ICONS[task.status]}
            </div>
            <div className="task-subject">{task.subject}</div>
            <div className="task-meta">
              <span className={`task-status-badge ${task.status}`}>
                {STATUS_LABELS[task.status]}
              </span>
              {owner && (
                <span className="task-owner">
                  <AgentAvatar agent={owner} />
                  {onFocusAgent ? (
                    <button className="agent-link" onClick={() => onFocusAgent(owner.id)}>
                      {owner.name}
                    </button>
                  ) : (
                    <span>{owner.name}</span>
                  )}
                </span>
              )}
            </div>
            {task.blockedBy.length > 0 && (
              <div className="task-dependency blocked-by">
                <span className="dep-icon">{'\u26D4'}</span> Blocked by: {task.blockedBy.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <TaskRef taskId={id} onFocusTask={onFocusTask} />
                  </span>
                ))}
              </div>
            )}
            {blocksOthers && blocksOthers.length > 0 && (
              <div className="task-dependency blocks">
                <span className="dep-icon">{'\u{1F6A7}'}</span> Blocks: {blocksOthers.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ', '}
                    <TaskRef taskId={id} onFocusTask={onFocusTask} />
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
