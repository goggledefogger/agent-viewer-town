import type { TeamState, AgentState, TaskState, MessageState, SessionInfo, SessionListEntry, WSMessage } from '@agent-viewer/shared';

type Listener = (msg: WSMessage) => void;

export class StateManager {
  private state: TeamState = {
    name: '',
    agents: [],
    tasks: [],
    messages: [],
  };

  /** All detected sessions keyed by sessionId */
  private sessions = new Map<string, SessionInfo>();

  private listeners: Set<Listener> = new Set();
  private maxMessages = 200;

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(msg: WSMessage) {
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.warn('[state] Listener error:', err instanceof Error ? err.message : err);
      }
    }
  }

  getState(): TeamState {
    return this.state;
  }

  setTeamName(name: string) {
    this.state.name = name;
    this.broadcastFullState();
  }

  setAgents(agents: AgentState[]) {
    // Preserve tasksCompleted and status from existing agents
    const existing = new Map(this.state.agents.map((a) => [a.id, a]));
    for (const agent of agents) {
      const prev = existing.get(agent.id);
      if (prev) {
        agent.tasksCompleted = prev.tasksCompleted;
        agent.status = prev.status;
        agent.currentAction = prev.currentAction;
      }
    }
    this.state.agents = agents;
    this.broadcastFullState();
  }

  updateAgent(agent: AgentState) {
    const idx = this.state.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      this.state.agents[idx] = agent;
      this.broadcast({ type: 'agent_update', data: agent });
    } else {
      this.state.agents.push(agent);
      this.broadcast({ type: 'agent_added', data: agent });
    }
  }

  removeAgent(id: string) {
    this.state.agents = this.state.agents.filter((a) => a.id !== id);
    this.broadcast({ type: 'agent_removed', data: { id } });
  }

  updateTask(task: TaskState) {
    const idx = this.state.tasks.findIndex((t) => t.id === task.id);
    if (idx >= 0) {
      const oldTask = this.state.tasks[idx];

      // Track completed tasks for agent evolution
      if (oldTask.status !== 'completed' && task.status === 'completed' && task.owner) {
        const agent = this.state.agents.find((a) => a.name === task.owner);
        if (agent) {
          agent.tasksCompleted += 1;
          this.broadcast({ type: 'agent_update', data: agent });
        }
      }

      // Detect task ownership changes: clear old owner status if reassigned
      if (oldTask.owner && oldTask.owner !== task.owner && oldTask.status === 'in_progress') {
        const oldAgent = this.state.agents.find((a) => a.name === oldTask.owner);
        if (oldAgent && oldAgent.status === 'working') {
          const hasOtherActiveTasks = this.state.tasks.some(
            (t) => t.id !== task.id && t.owner === oldTask.owner && t.status === 'in_progress'
          );
          if (!hasOtherActiveTasks) {
            oldAgent.status = 'idle';
            oldAgent.currentAction = undefined;
            this.broadcast({ type: 'agent_update', data: oldAgent });
          }
        }
      }

      this.state.tasks[idx] = task;
    } else {
      this.state.tasks.push(task);
    }
    this.broadcast({ type: 'task_update', data: task });
  }

  removeTask(taskId: string) {
    this.state.tasks = this.state.tasks.filter((t) => t.id !== taskId);
    this.broadcastFullState();
  }

  addMessage(message: MessageState) {
    // Deduplicate messages by id
    if (this.state.messages.some((m) => m.id === message.id)) {
      return;
    }
    this.state.messages.push(message);
    if (this.state.messages.length > this.maxMessages) {
      this.state.messages = this.state.messages.slice(-this.maxMessages);
    }
    this.broadcast({ type: 'new_message', data: message });
  }

  updateAgentActivity(agentName: string, status: 'idle' | 'working' | 'done', action?: string) {
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.status = status;
      agent.currentAction = action;
      this.broadcast({ type: 'agent_update', data: agent });
    }
  }

  reconcileAgentStatuses() {
    const inProgressOwners = new Set<string>();
    for (const task of this.state.tasks) {
      if (task.status === 'in_progress' && task.owner) {
        inProgressOwners.add(task.owner);
      }
    }

    for (const agent of this.state.agents) {
      const shouldBeWorking = inProgressOwners.has(agent.name);
      if (shouldBeWorking && agent.status !== 'working') {
        agent.status = 'working';
        this.broadcast({ type: 'agent_update', data: agent });
      } else if (!shouldBeWorking && agent.status === 'working') {
        agent.status = 'idle';
        agent.currentAction = undefined;
        this.broadcast({ type: 'agent_update', data: agent });
      }
    }
  }

  // --- Session management ---

  setSession(session: SessionInfo) {
    this.sessions.set(session.sessionId, session);
    this.state.session = session;
    this.broadcast({ type: 'session_started', data: session });
    this.broadcastSessionsList();
  }

  updateSessionActivity(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  removeSession(sessionId: string) {
    this.sessions.delete(sessionId);
    if (this.state.session?.sessionId === sessionId) {
      this.state.session = undefined;
    }
    this.broadcast({ type: 'session_ended', data: { sessionId } });
    this.broadcastSessionsList();
  }

  getSessions(): Map<string, SessionInfo> {
    return this.sessions;
  }

  getSessionsList(): SessionListEntry[] {
    const entries: SessionListEntry[] = [];
    for (const session of this.sessions.values()) {
      entries.push({
        sessionId: session.sessionId,
        projectName: session.projectName,
        gitBranch: session.gitBranch,
        isTeam: session.isTeam,
        agentCount: session.isTeam
          ? this.state.agents.filter((a) => this.state.name === session.teamName).length
          : 1,
        lastActivity: session.lastActivity,
        active: this.state.session?.sessionId === session.sessionId,
      });
    }
    return entries;
  }

  broadcastSessionsList() {
    this.broadcast({ type: 'sessions_list', data: this.getSessionsList() });
  }

  broadcastFullState() {
    this.broadcast({ type: 'full_state', data: this.state });
  }

  reset() {
    this.state = { name: '', agents: [], tasks: [], messages: [] };
    this.sessions.clear();
    this.broadcastFullState();
  }
}
