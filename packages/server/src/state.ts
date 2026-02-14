import type { TeamState, AgentState, TaskState, MessageState, SessionInfo, SessionListEntry, WSMessage } from '@agent-viewer/shared';
import { GuardManager } from './guards';

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

  /** Debounce timers for activity broadcasts (200ms window) */
  private activityDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** How long to debounce rapid activity updates (ms) */
  private activityDebounceMs = 200;

  /** Guard mechanisms coordinating hooks and JSONL watcher */
  private guards = new GuardManager();

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
        agent.actionContext = prev.actionContext;
        agent.currentTaskId = prev.currentTaskId;
        agent.recentActions = prev.recentActions;
        agent.gitBranch = prev.gitBranch;
        agent.gitWorktree = prev.gitWorktree;
        agent.gitAhead = prev.gitAhead;
        agent.gitBehind = prev.gitBehind;
        agent.gitHasUpstream = prev.gitHasUpstream;
        agent.gitDirty = prev.gitDirty;
        agent.teamName = prev.teamName;
      }
      this.allAgents.set(agent.id, agent);
    }
    this.state.agents = agents;
    this.broadcastFullState();
  }

  /** Get an agent from the full registry by ID */
  getAgentById(id: string): AgentState | undefined {
    return this.allAgents.get(id);
  }

  /** Add agent to registry only — does NOT add to displayed state.agents.
   *  Skips registration if the agent was recently removed (prevents JSONL
   *  watcher from re-registering subagents after SubagentStop removal). */
  registerAgent(agent: AgentState) {
    if (this.wasRecentlyRemoved(agent.id)) {
      return;
    }
    this.allAgents.set(agent.id, agent);
  }

  /** Add/update agent in both registry and displayed state.
   *  Skips update if the agent was recently removed (prevents JSONL
   *  watcher from re-displaying subagents after SubagentStop removal). */
  updateAgent(agent: AgentState) {
    if (this.wasRecentlyRemoved(agent.id)) {
      return;
    }
    this.allAgents.set(agent.id, agent);
    const idx = this.state.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      this.state.agents[idx] = agent;
      this.broadcast({ type: 'agent_update', data: agent });
    } else {
      // Add to display if this agent belongs to the active session
      const activeSession = this.state.session;
      const activeSessionId = activeSession?.sessionId;
      const shouldDisplay = activeSessionId === agent.id ||
        (agent.isSubagent && agent.parentAgentId === activeSessionId) ||
        (agent.teamName && activeSession?.isTeam && agent.teamName === activeSession.teamName);
      if (shouldDisplay) {
        this.state.agents.push(agent);
        this.broadcast({ type: 'agent_added', data: agent });
      }
    }
  }

  removeAgent(id: string) {
    this.allAgents.delete(id);
    this.state.agents = this.state.agents.filter((a) => a.id !== id);
    this.guards.markRemoved(id);
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

  updateAgentActivity(agentName: string, status: 'idle' | 'working' | 'done', action?: string, actionContext?: string) {
    // Update in the full registry
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.status = status;
        agent.currentAction = action;
        agent.actionContext = actionContext;
        // Clear waiting flag when going idle or done
        if (status === 'idle' || status === 'done') {
          agent.waitingForInput = false;
        }
        // Push to recent actions ring buffer
        if (action && status === 'working') {
          this.pushRecentAction(agent, action);
        }
        break;
      }
    }
    // Update in the displayed state
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.status = status;
      agent.currentAction = action;
      agent.actionContext = actionContext;
      if (status === 'idle' || status === 'done') {
        agent.waitingForInput = false;
      }
      this.broadcast({ type: 'agent_update', data: agent });
    }
  }

  /**
   * Update agent activity by ID instead of name.
   * This is essential for solo sessions where multiple sessions in the same
   * project would have agents with the same name (slug).
   *
   * Broadcasts are debounced by 200ms so rapid tool sequences (Read->Edit->Write)
   * don't cause the UI to flash each intermediate action.
   */
  updateAgentActivityById(agentId: string, status: 'idle' | 'working' | 'done', action?: string, actionContext?: string) {
    const agent = this.allAgents.get(agentId);
    if (!agent) return;
    agent.status = status;
    agent.currentAction = action;
    agent.actionContext = actionContext;
    if (status === 'idle' || status === 'done') {
      agent.waitingForInput = false;
    }
    // Push to recent actions ring buffer
    if (action && status === 'working') {
      this.pushRecentAction(agent, action);
    }
    // Also update in the displayed state if this agent is currently shown
    const displayed = this.state.agents.find((a) => a.id === agentId);
    if (displayed) {
      displayed.status = status;
      displayed.currentAction = action;
      displayed.actionContext = actionContext;
      if (status === 'idle' || status === 'done') {
        displayed.waitingForInput = false;
      }

      // For status transitions (idle, done) broadcast immediately.
      // For rapid working updates, debounce to reduce UI flicker.
      if (status !== 'working') {
        // Cancel any pending debounce and broadcast immediately
        const existing = this.activityDebounceTimers.get(agentId);
        if (existing) {
          clearTimeout(existing);
          this.activityDebounceTimers.delete(agentId);
        }
        this.broadcast({ type: 'agent_update', data: displayed });
      } else {
        // Debounce working updates — cancel previous and schedule new
        const existing = this.activityDebounceTimers.get(agentId);
        if (existing) clearTimeout(existing);
        this.activityDebounceTimers.set(agentId, setTimeout(() => {
          this.activityDebounceTimers.delete(agentId);
          this.broadcast({ type: 'agent_update', data: displayed });
        }, this.activityDebounceMs));
      }
    }
  }

  setAgentWaiting(agentName: string, waiting: boolean, action?: string, actionContext?: string) {
    // Update in the full registry
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.waitingForInput = waiting;
        if (action) agent.currentAction = action;
        if (actionContext !== undefined) agent.actionContext = actionContext;
        break;
      }
    }
    // Update in the displayed state
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.waitingForInput = waiting;
      if (action) agent.currentAction = action;
      if (actionContext !== undefined) agent.actionContext = actionContext;
      this.broadcast({ type: 'agent_update', data: agent });
    }
  }

  /**
   * Set agent waiting state by ID instead of name.
   * This is essential for solo sessions where multiple sessions in the same
   * project would have agents with the same name (slug).
   */
  setAgentWaitingById(agentId: string, waiting: boolean, action?: string, actionContext?: string) {
    const agent = this.allAgents.get(agentId);
    if (!agent) return;
    agent.waitingForInput = waiting;
    if (action) agent.currentAction = action;
    if (actionContext !== undefined) agent.actionContext = actionContext;
    // Also update in the displayed state if this agent is currently shown
    const displayed = this.state.agents.find((a) => a.id === agentId);
    if (displayed) {
      displayed.waitingForInput = waiting;
      if (action) displayed.currentAction = action;
      if (actionContext !== undefined) displayed.actionContext = actionContext;
      this.broadcast({ type: 'agent_update', data: displayed });
    }
  }

  /** Push an action to the agent's recentActions ring buffer (max 5 entries) */
  private pushRecentAction(agent: AgentState, action: string) {
    if (!agent.recentActions) {
      agent.recentActions = [];
    }
    agent.recentActions.push({ action, timestamp: Date.now() });
    if (agent.recentActions.length > 5) {
      agent.recentActions = agent.recentActions.slice(-5);
    }
  }

  /** Update git branch/worktree info on an agent and its session */
  updateAgentGitInfo(agentId: string, gitBranch?: string, gitWorktree?: string, gitStatus?: { ahead?: number; behind?: number; hasUpstream?: boolean; isDirty?: boolean }) {
    const agent = this.allAgents.get(agentId);
    if (agent) {
      if (gitBranch !== undefined) agent.gitBranch = gitBranch;
      if (gitWorktree !== undefined) agent.gitWorktree = gitWorktree;
      if (gitStatus) {
        if (gitStatus.ahead !== undefined) agent.gitAhead = gitStatus.ahead;
        if (gitStatus.behind !== undefined) agent.gitBehind = gitStatus.behind;
        if (gitStatus.hasUpstream !== undefined) agent.gitHasUpstream = gitStatus.hasUpstream;
        if (gitStatus.isDirty !== undefined) agent.gitDirty = gitStatus.isDirty;
      }
    }
    // Also update the session info
    const session = this.sessions.get(agentId);
    if (session) {
      if (gitBranch !== undefined) session.gitBranch = gitBranch;
      if (gitWorktree !== undefined) session.gitWorktree = gitWorktree;
    }
    // Broadcast if the agent is displayed
    const displayed = this.state.agents.find((a) => a.id === agentId);
    if (displayed) {
      if (gitBranch !== undefined) displayed.gitBranch = gitBranch;
      if (gitWorktree !== undefined) displayed.gitWorktree = gitWorktree;
      if (gitStatus) {
        if (gitStatus.ahead !== undefined) displayed.gitAhead = gitStatus.ahead;
        if (gitStatus.behind !== undefined) displayed.gitBehind = gitStatus.behind;
        if (gitStatus.hasUpstream !== undefined) displayed.gitHasUpstream = gitStatus.hasUpstream;
        if (gitStatus.isDirty !== undefined) displayed.gitDirty = gitStatus.isDirty;
      }
      this.broadcast({ type: 'agent_update', data: displayed });
    }
  }

  /** Set or clear the currentTaskId on an agent */
  setAgentCurrentTask(agentId: string, taskId: string | undefined) {
    const agent = this.allAgents.get(agentId);
    if (!agent) return;
    agent.currentTaskId = taskId;
    const displayed = this.state.agents.find((a) => a.id === agentId);
    if (displayed) {
      displayed.currentTaskId = taskId;
      this.broadcast({ type: 'agent_update', data: displayed });
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

  /** Mark a session as stopped (Stop hook fired). Prevents JSONL watcher from overriding idle state. */
  markSessionStopped(sessionId: string) {
    this.guards.markSessionStopped(sessionId);
  }

  /** Clear the stopped flag (new turn started via UserPromptSubmit). */
  clearSessionStopped(sessionId: string) {
    this.guards.clearSessionStopped(sessionId);
  }

  /** Check if a session has been stopped and shouldn't be overridden by JSONL. */
  isSessionStopped(sessionId: string): boolean {
    return this.guards.isSessionStopped(sessionId);
  }

  /** Check if an agent was recently removed (within 5 minutes). */
  wasRecentlyRemoved(id: string): boolean {
    return this.guards.wasRecentlyRemoved(id);
  }

  /** Allow explicit re-registration (e.g., SubagentStart hook for a new spawn with same ID). */
  clearRecentlyRemoved(id: string) {
    this.guards.clearRecentlyRemoved(id);
  }

  /** Register a mapping from a JSONL session ID to a team agent ID. */
  registerSessionToAgentMapping(sessionId: string, teamAgentId: string) {
    this.guards.registerSessionToAgentMapping(sessionId, teamAgentId);
  }

  /** Resolve a JSONL session ID to the effective agent ID. */
  resolveAgentId(sessionId: string): string {
    return this.guards.resolveAgentId(sessionId);
  }

  /** Record that a hook event was received for this session. */
  markHookActive(sessionId: string) {
    this.guards.markHookActive(sessionId);
  }

  /** Check if hooks have been actively providing events for this session recently. */
  isHookActive(sessionId: string, withinMs = 5000): boolean {
    return this.guards.isHookActive(sessionId, withinMs);
  }

  /** Get the full agent registry (for staleness checks across all agents). */
  getAllAgents(): Map<string, AgentState> {
    return this.allAgents;
  }

  removeSession(sessionId: string) {
    this.sessions.delete(sessionId);
    // Clean up any session-to-agent mappings for this session
    this.guards.removeSessionMappings(sessionId);
    if (this.state.session?.sessionId === sessionId) {
      this.state.session = undefined;
    }
    this.broadcast({ type: 'session_ended', data: { sessionId } });
    this.broadcastSessionsList();
  }

  getSessions(): Map<string, SessionInfo> {
    return this.sessions;
  }

  /**
   * Core filtering logic: which agents belong to a given session?
   *
   * Solo sessions: the session's own agent + its subagents.
   * Team sessions: all agents except solo session agents.
   *
   * This is the SINGLE source of truth for membership — used by
   * selectSession, getStateForSession, and agentBelongsToSession.
   */
  private getAgentsForSession(session: SessionInfo): AgentState[] {
    if (!session.isTeam) {
      const soloAgent = this.allAgents.get(session.sessionId);
      const subagents = [...this.allAgents.values()].filter(
        (a) => a.isSubagent && a.parentAgentId === session.sessionId
      );
      return soloAgent ? [soloAgent, ...subagents] : [...subagents];
    } else {
      const soloSessionIds = new Set(
        [...this.sessions.values()]
          .filter((s) => !s.isTeam)
          .map((s) => s.sessionId)
      );
      return [...this.allAgents.values()].filter(
        (a) => !soloSessionIds.has(a.id)
      );
    }
  }

  /** Switch the active displayed session */
  selectSession(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.state.session = session;
    this.state.name = session.isTeam
      ? (session.teamName || session.projectName)
      : session.projectName;
    this.state.agents = this.getAgentsForSession(session);
    this.state.tasks = session.isTeam ? this.state.tasks : [];
    this.broadcastFullState();
    this.broadcastSessionsList();
  }

  /**
   * Build a TeamState snapshot for a specific session without mutating global state.
   * Used by per-client WebSocket handlers to send each client their own view.
   */
  getStateForSession(sessionId: string): TeamState {
    const session = this.sessions.get(sessionId);
    if (!session) return this.state;

    return {
      name: session.isTeam
        ? (session.teamName || session.projectName)
        : session.projectName,
      agents: this.getAgentsForSession(session),
      tasks: session.isTeam ? this.state.tasks : [],
      messages: this.state.messages,
      session,
    };
  }

  /**
   * Check if an agent belongs to a given session.
   * Used by per-client WebSocket handlers to filter granular updates.
   */
  agentBelongsToSession(agentId: string, sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    return this.getAgentsForSession(session).some((a) => a.id === agentId);
  }

  /** Get the default (most recently auto-selected) session ID */
  getDefaultSessionId(): string | undefined {
    return this.state.session?.sessionId;
  }

  /**
   * Get the sessions list, optionally marking a specific session as active.
   * Supports per-client session selection.
   */
  getSessionsList(activeSessionId?: string): SessionListEntry[] {
    const effectiveActiveId = activeSessionId ?? this.state.session?.sessionId;
    const entries: SessionListEntry[] = [];
    for (const session of this.sessions.values()) {
      entries.push({
        sessionId: session.sessionId,
        projectName: session.projectName,
        gitBranch: session.gitBranch,
        isTeam: session.isTeam,
        agentCount: session.isTeam
          ? this.getAgentsForSession(session).length
          : 1,
        lastActivity: session.lastActivity,
        active: effectiveActiveId === session.sessionId,
      });
    }
    // Most recently active first
    entries.sort((a, b) => b.lastActivity - a.lastActivity);
    return entries;
  }

  /** Select the session with the most recent lastActivity */
  selectMostRecentSession() {
    let best: SessionInfo | undefined;
    for (const session of this.sessions.values()) {
      if (!best || session.lastActivity > best.lastActivity) {
        best = session;
      }
    }
    if (best) {
      this.selectSession(best.sessionId);
    }
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
    this.guards.reset();
    this.broadcastFullState();
  }
}
