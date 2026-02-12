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

  /** All agents keyed by id — never destructively filtered */
  private allAgents = new Map<string, AgentState>();

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
    for (const agent of agents) {
      const prev = this.allAgents.get(agent.id);
      if (prev) {
        agent.tasksCompleted = prev.tasksCompleted;
        agent.status = prev.status;
        agent.currentAction = prev.currentAction;
      }
      this.allAgents.set(agent.id, agent);
    }
    this.state.agents = agents;
    this.broadcastFullState();
  }

  /** Add agent to registry only — does NOT add to displayed state.agents */
  registerAgent(agent: AgentState) {
    this.allAgents.set(agent.id, agent);
  }

  /** Add/update agent in both registry and displayed state */
  updateAgent(agent: AgentState) {
    this.allAgents.set(agent.id, agent);
    const idx = this.state.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      this.state.agents[idx] = agent;
      this.broadcast({ type: 'agent_update', data: agent });
    } else {
      // Only add to display if this agent belongs to the active session
      const activeSessionId = this.state.session?.sessionId;
      if (activeSessionId === agent.id) {
        this.state.agents.push(agent);
        this.broadcast({ type: 'agent_added', data: agent });
      }
    }
  }

  removeAgent(id: string) {
    this.allAgents.delete(id);
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
    // Update in the full registry
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.status = status;
        agent.currentAction = action;
        // Clear waiting flag when going idle or done
        if (status === 'idle' || status === 'done') {
          agent.waitingForInput = false;
        }
        break;
      }
    }
    // Update in the displayed state
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.status = status;
      agent.currentAction = action;
      if (status === 'idle' || status === 'done') {
        agent.waitingForInput = false;
      }
      this.broadcast({ type: 'agent_update', data: agent });
    }
  }

  setAgentWaiting(agentName: string, waiting: boolean, action?: string) {
    // Update in the full registry
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.waitingForInput = waiting;
        if (action) agent.currentAction = action;
        break;
      }
    }
    // Update in the displayed state
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.waitingForInput = waiting;
      if (action) agent.currentAction = action;
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

  /** @deprecated Use addSession instead */
  setSession(session: SessionInfo) {
    this.addSession(session);
  }

  /**
   * Register a new session. Auto-selects it if:
   * - No session is currently active, OR
   * - This session is more recently active than the current one
   */
  addSession(session: SessionInfo) {
    this.sessions.set(session.sessionId, session);
    this.broadcast({ type: 'session_started', data: session });

    // Auto-select: pick this session if none is active, or if it's fresher
    const current = this.state.session;
    const shouldSelect = !current || session.lastActivity > (current.lastActivity || 0);
    if (shouldSelect) {
      this.selectSession(session.sessionId);
    } else {
      this.broadcastSessionsList();
    }
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

  /** Switch the active displayed session */
  selectSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.state.session = session;
    if (!session.isTeam) {
      // For solo sessions, show only that session's agent (from the full registry)
      this.state.name = session.projectName;
      const soloAgent = this.allAgents.get(sessionId);
      this.state.agents = soloAgent ? [soloAgent] : [];
      this.state.tasks = [];
    } else {
      // For team sessions, show all team agents from the registry
      this.state.name = session.teamName || session.projectName;
      // Rebuild agents from allAgents (exclude solo session agents)
      const soloSessionIds = new Set(
        [...this.sessions.values()]
          .filter((s) => !s.isTeam)
          .map((s) => s.sessionId)
      );
      this.state.agents = [...this.allAgents.values()].filter(
        (a) => !soloSessionIds.has(a.id)
      );
    }
    this.broadcastFullState();
    this.broadcastSessionsList();
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

  /** Remove only team-config agents (not solo session agents) */
  clearTeamAgents() {
    // Keep agents whose ID matches a known solo session
    const soloSessionIds = new Set(
      [...this.sessions.values()]
        .filter((s) => !s.isTeam)
        .map((s) => s.sessionId)
    );
    // Remove non-solo agents from the full registry
    for (const [id] of this.allAgents) {
      if (!soloSessionIds.has(id)) {
        this.allAgents.delete(id);
      }
    }
    this.state.agents = this.state.agents.filter((a) => soloSessionIds.has(a.id));
    this.state.tasks = [];
    this.state.name = '';
    this.broadcastFullState();
  }

  reset() {
    this.state = { name: '', agents: [], tasks: [], messages: [] };
    this.sessions.clear();
    this.allAgents.clear();
    this.broadcastFullState();
  }
}
