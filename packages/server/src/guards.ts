/**
 * GuardManager — encapsulates guard mechanisms that prevent stale agent state.
 *
 * These guards coordinate between the hooks system (primary, real-time) and
 * the JSONL watcher (fallback, delayed) to avoid conflicting state updates:
 *
 * - stoppedSessions: Prevents JSONL from overriding idle state after Stop hook
 * - removedAgents: Prevents JSONL from re-registering removed subagents
 * - hookActiveSessions: Defers JSONL updates when hooks are actively providing data
 * - sessionToTeamAgent: Maps JSONL session UUIDs to team agent config IDs
 */
export class GuardManager {
  /**
   * Sessions where a Stop hook has fired, preventing JSONL watcher from
   * overriding the idle state. Cleared when UserPromptSubmit fires (new turn).
   */
  private stoppedSessions = new Set<string>();

  /**
   * Recently removed agent IDs with removal timestamp.
   * Prevents the JSONL watcher from re-registering agents that were
   * already removed (e.g., subagents after SubagentStop → 15s removal).
   * Entries expire after 5 minutes.
   */
  private removedAgents = new Map<string, number>();

  /**
   * Sessions with recent hook activity, keyed by sessionId → last hook timestamp.
   * When hooks are actively providing events for a session, the JSONL watcher
   * should defer to hooks for activity/status updates to avoid stale overrides.
   */
  private hookActiveSessions = new Map<string, number>();

  /**
   * Maps JSONL session IDs to team agent IDs.
   * Hook events use JSONL session UUIDs (e.g., "23576460-b068-...") but team agents
   * are registered with config-based IDs (e.g., "researcher@visual-upgrade").
   * This mapping lets hooks route activity updates to the correct team agent.
   */
  private sessionToTeamAgent = new Map<string, string>();

  // --- Stopped sessions ---

  /** Mark a session as stopped (Stop hook fired). Prevents JSONL watcher from overriding idle state. */
  markSessionStopped(sessionId: string) {
    this.stoppedSessions.add(sessionId);
  }

  /** Clear the stopped flag (new turn started via UserPromptSubmit). */
  clearSessionStopped(sessionId: string) {
    this.stoppedSessions.delete(sessionId);
  }

  /** Check if a session has been stopped and shouldn't be overridden by JSONL. */
  isSessionStopped(sessionId: string): boolean {
    return this.stoppedSessions.has(sessionId);
  }

  // --- Removed agents ---

  /** Record that an agent was removed. */
  markRemoved(id: string) {
    this.removedAgents.set(id, Date.now());
  }

  /** Check if an agent was recently removed (within 5 minutes). */
  wasRecentlyRemoved(id: string): boolean {
    const removedAt = this.removedAgents.get(id);
    if (!removedAt) return false;
    if (Date.now() - removedAt > 300_000) {
      this.removedAgents.delete(id);
      return false;
    }
    return true;
  }

  /** Allow explicit re-registration (e.g., SubagentStart hook for a new spawn with same ID). */
  clearRecentlyRemoved(id: string) {
    this.removedAgents.delete(id);
  }

  // --- Hook activity tracking ---

  /** Record that a hook event was received for this session. */
  markHookActive(sessionId: string) {
    this.hookActiveSessions.set(sessionId, Date.now());
  }

  /**
   * Check if hooks have been actively providing events for this session recently.
   * When true, JSONL watcher should defer activity/status updates to hooks.
   */
  isHookActive(sessionId: string, withinMs = 5000): boolean {
    const lastHook = this.hookActiveSessions.get(sessionId);
    if (!lastHook) return false;
    return (Date.now() - lastHook) < withinMs;
  }

  // --- Session-to-agent mapping ---

  /** Register a mapping from a JSONL session ID to a team agent ID.
   *  This allows hook events (which use session UUIDs) to route to the
   *  correct team agent (which uses config-based IDs like "researcher@team"). */
  registerSessionToAgentMapping(sessionId: string, teamAgentId: string) {
    this.sessionToTeamAgent.set(sessionId, teamAgentId);
    console.log(`[state] Session mapping: ${sessionId.slice(0, 8)} -> ${teamAgentId}`);
  }

  /** Resolve a JSONL session ID to the effective agent ID.
   *  Returns the team agent ID if a mapping exists, otherwise the session ID itself. */
  resolveAgentId(sessionId: string): string {
    return this.sessionToTeamAgent.get(sessionId) || sessionId;
  }

  /** Remove session-to-agent mappings for a given session ID. */
  removeSessionMappings(sessionId: string) {
    for (const [sid, agentId] of this.sessionToTeamAgent) {
      if (sid === sessionId || agentId === sessionId) {
        this.sessionToTeamAgent.delete(sid);
      }
    }
  }

  /** Reset all guard state. */
  reset() {
    this.stoppedSessions.clear();
    this.removedAgents.clear();
    this.hookActiveSessions.clear();
    this.sessionToTeamAgent.clear();
  }
}
