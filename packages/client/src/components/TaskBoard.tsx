import type { TaskState, AgentState } from '@agent-viewer/shared';

interface TaskBoardProps {
  tasks: TaskState[];
  agents: AgentState[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  in_progress: '⚙',
  completed: '✓',
};

export function TaskBoard({ tasks, agents }: TaskBoardProps) {
  if (tasks.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
        No tasks yet
      </div>
    );
  }

  // Sort: in_progress first, then pending, then completed
  const sorted = [...tasks].sort((a, b) => {
    const order = { in_progress: 0, pending: 1, completed: 2 };
    return (order[a.status] ?? 1) - (order[b.status] ?? 1);
  });

  return (
    <div>
      {sorted.map((task) => {
        const owner = agents.find((a) => a.name === task.owner);
        return (
          <div key={task.id} className={`task-card ${task.status}`}>
            <div className="task-id">
              #{task.id} {STATUS_ICONS[task.status]}
            </div>
            <div className="task-subject">{task.subject}</div>
            <div className="task-meta">
              <span className={`task-status-badge ${task.status}`}>
                {STATUS_LABELS[task.status]}
              </span>
              {task.owner && (
                <span style={{ color: 'var(--color-text-dim)' }}>
                  {owner ? owner.name : task.owner}
                </span>
              )}
            </div>
            {task.blockedBy.length > 0 && (
              <div style={{ fontSize: '10px', color: 'var(--color-text-dim)', marginTop: '4px' }}>
                Blocked by: {task.blockedBy.map((id) => `#${id}`).join(', ')}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
