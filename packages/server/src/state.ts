import type { TeamState, AgentState, TaskState, MessageState, SessionInfo, SessionListEntry, GroupedSessionsList, WSMessage } from '@agent-viewer/shared';
import { GuardManager } from './guards';
import { buildSessionsList, buildGroupedSessionsList } from './state/sessionListBuilder';

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
    let registryAgent: AgentState | undefined;
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.status = status;
        agent.currentAction = action;
        agent.actionContext = actionContext;
        // Clear waiting flag when going idle or done
        if (status === 'idle' || status === 'done') {
          agent.waitingForInput = false;
          agent.waitingType = undefined;
        }
        // Push to recent actions ring buffer
        if (action && status === 'working') {
          this.pushRecentAction(agent, action);
        }
        registryAgent = agent;
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
        agent.waitingType = undefined;
      }
    }
    // Broadcast using displayed entry or allAgents entry
    const broadcastAgent = agent || registryAgent;
    if (broadcastAgent) {
      this.broadcast({ type: 'agent_update', data: broadcastAgent });
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
    const prevStatus = agent.status;
    agent.status = status;
    agent.currentAction = action;
    agent.actionContext = actionContext;
    if (status === 'idle' || status === 'done') {
      agent.waitingForInput = false;
      agent.waitingType = undefined;
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
        displayed.waitingType = undefined;
      }
    }

    // Broadcast agent_update using the allAgents entry (not just the displayed one).
    // The agent may not be in state.agents (global display) if a different session is
    // globally selected, but per-client WebSocket filtering uses getStateForSession()
    // which reads from allAgents — so clients viewing this agent's session will receive it.
    const broadcastAgent = displayed || agent;

    // For status transitions (idle, done) broadcast immediately.
    // For rapid working updates, debounce to reduce UI flicker.
    if (status !== 'working') {
      // Cancel any pending debounce and broadcast immediately
      const existing = this.activityDebounceTimers.get(agentId);
      if (existing) {
        clearTimeout(existing);
        this.activityDebounceTimers.delete(agentId);
      }
      this.broadcast({ type: 'agent_update', data: broadcastAgent });
    } else {
      // Debounce working updates — cancel previous and schedule new
      const existing = this.activityDebounceTimers.get(agentId);
      if (existing) clearTimeout(existing);
      this.activityDebounceTimers.set(agentId, setTimeout(() => {
        this.activityDebounceTimers.delete(agentId);
        this.broadcast({ type: 'agent_update', data: broadcastAgent });
      }, this.activityDebounceMs));
    }

    // When status transitions between idle/working/done, broadcast updated
    // sessions list so ALL clients see the change in their navigation tree
    // (e.g., openclaw-setup becoming active while viewing agent-viewer-town).
    if (prevStatus !== status) {
      this.broadcastSessionsList();
    }
  }

  setAgentWaiting(agentName: string, waiting: boolean, action?: string, actionContext?: string) {
    // Update in the full registry
    let registryAgent: AgentState | undefined;
    for (const agent of this.allAgents.values()) {
      if (agent.name === agentName) {
        agent.waitingForInput = waiting;
        if (action) agent.currentAction = action;
        if (actionContext !== undefined) agent.actionContext = actionContext;
        registryAgent = agent;
        break;
      }
    }
    // Update in the displayed state
    const agent = this.state.agents.find((a) => a.name === agentName);
    if (agent) {
      agent.waitingForInput = waiting;
      if (action) agent.currentAction = action;
      if (actionContext !== undefined) agent.actionContext = actionContext;
    }
    // Broadcast using displayed entry or allAgents entry
    const broadcastAgent = agent || registryAgent;
    if (broadcastAgent) {
      this.broadcast({ type: 'agent_update', data: broadcastAgent });
    }
  }

  /**
   * Set agent waiting state by ID instead of name.
   * This is essential for solo sessions where multiple sessions in the same
   * project would have agents with the same name (slug).
   */
  setAgentWaitingById(agentId: string, waiting: boolean, action?: string, actionContext?: string, waitingType?: AgentState['waitingType']) {
    const agent = this.allAgents.get(agentId);
    if (!agent) return;
    const wasWaiting = agent.waitingForInput;
    agent.waitingForInput = waiting;
    agent.waitingType = waiting ? waitingType : undefined;
    if (action) agent.currentAction = action;
    if (actionContext !== undefined) agent.actionContext = actionContext;
    // Also update in the displayed state if this agent is currently shown
    const displayed = this.state.agents.find((a) => a.id === agentId);
    if (displayed) {
      displayed.waitingForInput = waiting;
      displayed.waitingType = waiting ? waitingType : undefined;
      if (action) displayed.currentAction = action;
      if (actionContext !== undefined) displayed.actionContext = actionContext;
    }
    // Broadcast using displayed (if in global view) or allAgents entry.
    // Same pattern as updateAgentActivityById — ensures clients viewing
    // non-globally-selected sessions still receive updates.
    this.broadcast({ type: 'agent_update', data: displayed || agent });
    // When an agent transitions from waiting to not-waiting, broadcast updated
    // sessions list so ALL clients (even those viewing other sessions) learn that
    // hasWaitingAgent changed. This enables cross-session notification resolution.
    if (wasWaiting && !waiting) {
      this.broadcastSessionsList();
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

    // Auto-select: pick this session if none is active, or if it's a fresher
    // solo session. Team sessions are NOT auto-selected here because they may
    // be stale configs discovered during startup — let selectMostInterestingSession()
    // handle them after all watchers finish with proper scoring.
    const current = this.state.session;
    const shouldSelect = !session.isTeam &&
      (!current || session.lastActivity > (current.lastActivity || 0));
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
      // Filter by teamName so each team session only shows its own members.
      // Fallback to the agent ID suffix (@teamName) for agents that predate
      // the teamName property being set.
      const teamName = session.teamName;
      if (!teamName) return [];
      const suffix = `@${teamName}`;
      return [...this.allAgents.values()].filter(
        (a) => a.teamName === teamName || (!a.teamName && a.id.endsWith(suffix))
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
    if (!session) {
      // Session was removed (expired). Return empty state rather than falling
      // back to the global state, which would cause the client to suddenly
      // see a different project's agents. The client keeps their selectedSessionId
      // and will continue showing this empty state until they navigate away.
      return {
        name: '',
        agents: [],
        tasks: [],
        messages: [],
      };
    }

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
    return buildSessionsList(
      this.sessions,
      (session) => this.getAgentsForSession(session),
      effectiveActiveId,
    );
  }

  /**
   * Get sessions grouped hierarchically by project and branch.
   * Projects are sorted: active first, then waiting, then alphabetical.
   * Branches within a project: active first, then waiting, then alphabetical.
   * Sessions within a branch: active first, then waiting, then remaining.
   */
  getGroupedSessionsList(activeSessionId?: string): GroupedSessionsList {
    const effectiveActiveId = activeSessionId ?? this.state.session?.sessionId;
    return buildGroupedSessionsList(
      this.sessions,
      (session) => this.getAgentsForSession(session),
      effectiveActiveId,
    );
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

  /**
   * Score a session by "interestingness" for auto-selection on page load.
   * Higher score = more interesting = should be displayed first.
   *
   * Priority: actively working > waiting for input > recently active > has agents > recency
   */
  private scoreSession(session: SessionInfo): number {
    const agents = this.getAgentsForSession(session);
    const now = Date.now();
    const ageMs = now - session.lastActivity;
    let score = 0;

    // Actively working agents with very recent activity (< 30s)
    const hasActiveWorking = agents.some(a => a.status === 'working' && !a.waitingForInput) && ageMs < 30_000;
    if (hasActiveWorking) score += 1000;

    // Agents waiting for user input — these need attention
    if (agents.some(a => a.waitingForInput)) score += 500;

    // Any working agent (even if activity isn't super recent)
    if (agents.some(a => a.status === 'working')) score += 200;

    // Active in last 5 minutes
    if (ageMs < 300_000) score += 100;

    // Has agents registered (session with visible characters)
    if (agents.length > 0) score += 50;

    // Recency bonus: up to 49 points for very recent activity (0 = just now, 49 = 49+ min ago)
    score += Math.max(0, 49 - Math.floor(ageMs / 60_000));

    return score;
  }

  /**
   * Select the most "interesting" session for display on page load.
   * Uses a scoring system that prioritizes active work and user attention needs
   * over raw recency.
   */
  selectMostInterestingSession() {
    const id = this.getMostInterestingSessionId();
    if (id) {
      this.selectSession(id);
    }
  }

  /** Return the session ID with the highest interestingness score, without selecting it. */
  getMostInterestingSessionId(): string | undefined {
    let bestSession: SessionInfo | undefined;
    let bestScore = -1;

    for (const session of this.sessions.values()) {
      const score = this.scoreSession(session);
      if (score > bestScore) {
        bestScore = score;
        bestSession = session;
      }
    }

    return bestSession?.sessionId;
  }

  broadcastSessionsList() {
    this.broadcast({ type: 'sessions_list', data: this.getSessionsList() });
    this.broadcast({ type: 'sessions_grouped', data: this.getGroupedSessionsList() });
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
