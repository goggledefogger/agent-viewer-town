// Placeholder — will be fully implemented in task #2
export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  tasksCompleted: number;
  currentAction?: string;
}

export type AgentRole = 'lead' | 'researcher' | 'implementer' | 'tester' | 'planner';
export type AgentStatus = 'idle' | 'working' | 'done';

export interface TaskState {
  id: string;
  subject: string;
  status: TaskStatus;
  owner?: string;
  blockedBy: string[];
  blocks: string[];
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface MessageState {
  id: string;
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

export interface TeamState {
  name: string;
  agents: AgentState[];
  tasks: TaskState[];
  messages: MessageState[];
}

export type WSMessage =
  | { type: 'full_state'; data: TeamState }
  | { type: 'agent_update'; data: AgentState }
  | { type: 'task_update'; data: TaskState }
  | { type: 'new_message'; data: MessageState }
  | { type: 'agent_added'; data: AgentState }
  | { type: 'agent_removed'; data: { id: string } };
