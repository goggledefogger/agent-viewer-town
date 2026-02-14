export interface AgentState {
  id: string;
  name: string;
  role: AgentRole;
  status: AgentStatus;
  tasksCompleted: number;
  currentAction?: string;
  /** Supporting context for the current action (directory path, file filter, recipient) */
  actionContext?: string;
  /** ID of the task this agent is currently working on */
  currentTaskId?: string;
  /** Ring buffer of recent actions for the detail panel (last 5) */
  recentActions?: Array<{ action: string; timestamp: number }>;
  /** True when the agent is blocked waiting for user approval/input */
  waitingForInput?: boolean;
  /** True if this is a subagent spawned via the Task tool */
  isSubagent?: boolean;
  /** The parent session/agent ID that spawned this subagent */
  parentAgentId?: string;
  /** The subagent type (e.g., "Explore", "Plan", "Bash") */
  subagentType?: string;
  /** Team name if this agent is a team member (not a subagent) */
  teamName?: string;
  /** Current git branch the agent is working on */
  gitBranch?: string;
  /** Git worktree path if the agent is using a worktree */
  gitWorktree?: string;
  /** Commits ahead of remote tracking branch */
  gitAhead?: number;
  /** Commits behind remote tracking branch */
  gitBehind?: number;
  /** Whether the branch tracks a remote upstream */
  gitHasUpstream?: boolean;
  /** Whether the working tree has uncommitted changes */
  gitDirty?: boolean;
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

/** Metadata about a detected Claude Code session */
export interface SessionInfo {
  sessionId: string;
  /** Human-readable slug, e.g. "glistening-hatching-frost" */
  slug: string;
  /** Project directory, e.g. "/Users/Danny/Source/my-project" */
  projectPath: string;
  /** Cleaned project name, e.g. "my-project" */
  projectName: string;
  gitBranch?: string;
  /** Git worktree path if the session is running in a worktree */
  gitWorktree?: string;
  /** Root git repo path when running in a worktree (groups worktrees with parent) */
  mainRepoPath?: string;
  /** Whether this session is part of an agent team */
  isTeam: boolean;
  /** Team name if isTeam is true */
  teamName?: string;
  /** Claude Code agent ID for team members (e.g., "researcher@visual-upgrade") */
  agentId?: string;
  /** Timestamp of last JSONL activity */
  lastActivity: number;
}

export interface TeamState {
  name: string;
  agents: AgentState[];
  tasks: TaskState[];
  messages: MessageState[];
  /** Active session info (solo or team) */
  session?: SessionInfo;
}

/** Summary of all detected sessions for the session picker */
export interface SessionListEntry {
  sessionId: string;
  projectName: string;
  /** Resolved project path (uses mainRepoPath for worktrees) */
  projectPath: string;
  /** Human-readable slug, e.g. "glistening-frost" */
  slug: string;
  gitBranch?: string;
  isTeam: boolean;
  agentCount: number;
  lastActivity: number;
  /** Whether this is the currently displayed session */
  active: boolean;
  /** Whether any agent in this session is waiting for input */
  hasWaitingAgent: boolean;
}

/** A branch within a project, containing one or more sessions */
export interface BranchGroup {
  branch: string;
  isDefault: boolean;
  sessions: SessionListEntry[];
  totalAgents: number;
  lastActivity: number;
  hasWaitingAgent: boolean;
}

/** A project containing branches, each with sessions */
export interface ProjectGroup {
  projectKey: string;
  projectName: string;
  projectPath: string;
  branches: BranchGroup[];
  totalSessions: number;
  totalAgents: number;
  lastActivity: number;
  hasWaitingAgent: boolean;
}

/** Hierarchical session list grouped by project and branch */
export interface GroupedSessionsList {
  projects: ProjectGroup[];
  flatSessions: SessionListEntry[];
}

/** Types of inbox notifications */
export type NotificationType = 'permission' | 'question' | 'plan_review' | 'task_completed' | 'error' | 'idle';

/** A notification in the agent inbox */
export interface InboxNotification {
  id: string;
  agentId: string;
  agentName: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  read: boolean;
  /** Whether the condition that triggered this notification is still active */
  resolved: boolean;
}

export type WSMessage =
  | { type: 'full_state'; data: TeamState }
  | { type: 'agent_update'; data: AgentState }
  | { type: 'task_update'; data: TaskState }
  | { type: 'new_message'; data: MessageState }
  | { type: 'agent_added'; data: AgentState }
  | { type: 'agent_removed'; data: { id: string } }
  | { type: 'sessions_list'; data: SessionListEntry[] }
  | { type: 'sessions_grouped'; data: GroupedSessionsList }
  | { type: 'session_started'; data: SessionInfo }
  | { type: 'session_ended'; data: { sessionId: string } };
