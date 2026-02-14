import { IDLE_THRESHOLD_S, STALENESS_CHECK_INTERVAL_MS } from './types';
import type { WatcherContext } from './types';

/**
 * Periodically checks for stale sessions and cleans up orphaned subagents.
 * Returns an interval handle for cleanup.
 */
export function startStalenessChecker(ctx: WatcherContext) {
  const { stateManager, trackedSessions, registeredSubagents } = ctx;

  const stalenessInterval = setInterval(() => {
    const now = Date.now();

    // --- Check JSONL-tracked sessions (solo sessions and subagents) ---
    for (const [filePath, tracked] of trackedSessions) {
      if (!tracked.isSolo) continue;

      // Cleanup tracked sessions for agents removed by hooks (SubagentStop).
      // If the agent is gone from registry and this isn't the current session,
      // stop tracking it to prevent memory leaks from accumulating entries.
      const trackedAgent = stateManager.getAgentById(tracked.sessionId);
      if (!trackedAgent && tracked.sessionId !== stateManager.getState().session?.sessionId) {
        trackedSessions.delete(filePath);
        continue;
      }

      // Use the most recent activity from either JSONL file changes OR hook events.
      // Hooks update session.lastActivity via stateManager.updateSessionActivity(),
      // but that's a different timestamp than tracked.lastActivity (JSONL-based).
      // We must check both so hook activity prevents false idle transitions.
      const sessionActivity = stateManager.getSessions().get(tracked.sessionId)?.lastActivity ?? 0;
      const mostRecentActivity = Math.max(tracked.lastActivity, sessionActivity);
      const idleSeconds = (now - mostRecentActivity) / 1000;

      // Internal subagents (acompact): just clean up tracking when done, no display
      if (tracked.isInternalSubagent && idleSeconds >= IDLE_THRESHOLD_S) {
        trackedSessions.delete(tracked.filePath);
        continue;
      }

      // Mark as idle after inactivity (but don't remove the session)
      if (idleSeconds >= IDLE_THRESHOLD_S) {
        stateManager.setAgentWaitingById(tracked.sessionId, false);

        const agent = stateManager.getAgentById(tracked.sessionId);
        if (agent && agent.status === 'working') {
          if (agent.isSubagent) {
            stateManager.updateAgentActivityById(tracked.sessionId, 'done', 'Done');
          } else {
            stateManager.updateAgentActivityById(tracked.sessionId, 'idle');
          }
        }

        // Remove subagents from display after 5 minutes of inactivity
        if (agent?.isSubagent && idleSeconds >= 300) {
          stateManager.removeAgent(tracked.sessionId);
          trackedSessions.delete(tracked.filePath);
          registeredSubagents.delete(tracked.sessionId);
        }
      }
    }

    // --- Check hook-tracked agents (team members without JSONL entries) ---
    // Team agents created via hooks may not have trackedSessions entries.
    // Use hook-updated session.lastActivity as the activity source.
    const checkedIds = new Set([...trackedSessions.values()].map(t => t.sessionId));
    for (const session of stateManager.getSessions().values()) {
      // Skip sessions already covered by JSONL tracking above
      if (checkedIds.has(session.sessionId)) continue;

      const idleSeconds = (now - session.lastActivity) / 1000;
      if (idleSeconds < IDLE_THRESHOLD_S) continue;

      // Mark all working agents for this session as idle
      const state = stateManager.getState();
      for (const agent of state.agents) {
        if (agent.status !== 'working') continue;

        // Check if this agent belongs to this session (team member or the session agent itself)
        if (agent.id === session.sessionId || agent.teamName === session.teamName) {
          stateManager.setAgentWaitingById(agent.id, false);
          stateManager.updateAgentActivityById(agent.id, 'idle');
        }
      }
    }

    // --- Catch-all: remove orphaned subagents from allAgents ---
    // Subagents registered by hooks (SubagentStart) that were never properly
    // cleaned up. This covers edge cases where SubagentStop never fires or
    // the removal timer was lost (e.g., server restart).
    for (const [agentId, agent] of stateManager.getAllAgents()) {
      if (!agent.isSubagent) continue;
      if (checkedIds.has(agentId)) continue; // Already handled above

      // Check parent session activity
      const parentSession = stateManager.getSessions().get(agent.parentAgentId || '');
      const parentActivity = parentSession?.lastActivity ?? 0;
      const hookLastActive = stateManager.isHookActive(agentId, 300_000) ? now : 0;
      const mostRecent = Math.max(parentActivity, hookLastActive);
      const orphanIdleS = mostRecent > 0 ? (now - mostRecent) / 1000 : Infinity;

      // Remove orphaned subagents after 5 minutes of inactivity
      if (orphanIdleS >= 300) {
        console.log(`[watcher] Removing orphaned subagent: ${agentId.slice(0, 8)} (idle ${Math.round(orphanIdleS)}s)`);
        stateManager.removeAgent(agentId);
      }
    }
  }, STALENESS_CHECK_INTERVAL_MS);

  return stalenessInterval;
}
