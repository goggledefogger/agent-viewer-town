import { statSync } from 'fs';
import { IDLE_THRESHOLD_S, STALENESS_CHECK_INTERVAL_MS, SESSION_EXPIRY_S } from './types';
import type { WatcherContext } from './types';

/**
 * Run a single staleness sweep: mark idle agents, clean up subagents, expire old sessions.
 * Exported so it can be called immediately after initial scan completes.
 */
export function runStalenessCheck(ctx: WatcherContext) {
  const { stateManager, trackedSessions, registeredSubagents } = ctx;
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

    // Use the most recent activity from three sources:
    // 1. tracked.lastActivity — updated when JSONL watcher processes meaningful events
    // 2. session.lastActivity — updated by hooks via stateManager.updateSessionActivity()
    // 3. JSONL file mtime — catches activity during long thinking/generation where
    //    the file is being written to but no "meaningful" events have been parsed yet.
    //    This prevents false idle transitions during extended thinking periods (>60s).
    const sessionActivity = stateManager.getSessions().get(tracked.sessionId)?.lastActivity ?? 0;
    let fileMtime = 0;
    try {
      const stats = statSync(filePath);
      fileMtime = stats.mtimeMs;
    } catch {
      // File may have been removed
    }
    const mostRecentActivity = Math.max(tracked.lastActivity, sessionActivity, fileMtime);
    const idleSeconds = (now - mostRecentActivity) / 1000;

    // Internal subagents (acompact): just clean up tracking when done, no display
    if (tracked.isInternalSubagent && idleSeconds >= IDLE_THRESHOLD_S) {
      trackedSessions.delete(tracked.filePath);
      continue;
    }

    // Mark as idle after inactivity — but first check if a compaction subagent
    // is still running. During compaction, the parent JSONL and hooks are quiet
    // (all activity is on the acompact subagent file), so the parent looks stale.
    // Check tracked acompact entries and their file mtime before marking idle.
    if (idleSeconds >= IDLE_THRESHOLD_S) {
      let hasActiveCompaction = false;
      for (const t of trackedSessions.values()) {
        if (!t.isInternalSubagent) continue;
        if (!t.filePath.includes(`/${tracked.sessionId}/`)) continue;
        // Check the acompact file's mtime — if it's recent, compaction is ongoing
        try {
          const acompactStats = statSync(t.filePath);
          const acompactAgeS = (now - acompactStats.mtimeMs) / 1000;
          if (acompactAgeS < IDLE_THRESHOLD_S) {
            hasActiveCompaction = true;
            break;
          }
        } catch {
          // File gone, not active
        }
      }

      if (hasActiveCompaction) {
        // Keep the agent in "Compacting" state — don't mark idle
        const agent = stateManager.getAgentById(tracked.sessionId);
        if (agent && agent.status === 'working' && agent.currentAction !== 'Compacting conversation...') {
          stateManager.updateAgentActivityById(tracked.sessionId, 'working', 'Compacting conversation...');
        }
        continue;
      }

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

      // Remove solo sessions after extended inactivity (SESSION_EXPIRY_S).
      // This prevents stale sessions from accumulating over hours.
      // Event-driven: broadcasts session_ended to all connected clients.
      if (tracked.isSolo && !agent?.isSubagent && idleSeconds >= SESSION_EXPIRY_S) {
        console.log(`[watcher] Expiring stale session: ${tracked.sessionId.slice(0, 8)} (idle ${Math.round(idleSeconds)}s)`);
        stateManager.removeAgent(tracked.sessionId);
        stateManager.removeSession(tracked.sessionId);
        trackedSessions.delete(tracked.filePath);
        ctx.registeredSessions.delete(tracked.sessionId);
        // If the expired session was the active one, select the next most interesting
        if (!stateManager.getState().session) {
          stateManager.selectMostInterestingSession();
        }
      }
    }
  }

  // --- Check hook-tracked agents (team members without JSONL entries) ---
  // Team agents created via hooks may not have trackedSessions entries.
  // Use hook-updated session.lastActivity as the activity source.
  const checkedIds = new Set([...trackedSessions.values()].map(t => t.sessionId));
  const sessionsToExpire: string[] = [];
  for (const session of stateManager.getSessions().values()) {
    // Skip sessions already covered by JSONL tracking above
    if (checkedIds.has(session.sessionId)) continue;

    const idleSeconds = (now - session.lastActivity) / 1000;
    if (idleSeconds < IDLE_THRESHOLD_S) continue;

    // Mark all working agents for this session as idle.
    // Check allAgents (not just state.agents) so agents from non-active sessions are also caught.
    for (const [agentId, agent] of stateManager.getAllAgents()) {
      if (agent.status !== 'working') continue;

      // Check if this agent belongs to this session (team member or the session agent itself)
      if (agentId === session.sessionId || agent.teamName === session.teamName) {
        stateManager.setAgentWaitingById(agentId, false);
        stateManager.updateAgentActivityById(agentId, 'idle');
      }
    }

    // Expire team sessions after extended inactivity, same as solo sessions.
    // This prevents old team configs from polluting the UI indefinitely.
    if (session.isTeam && idleSeconds >= SESSION_EXPIRY_S) {
      sessionsToExpire.push(session.sessionId);
    }
  }

  // Remove expired team sessions (done outside the iterator to avoid mutation during iteration)
  for (const sessionId of sessionsToExpire) {
    console.log(`[watcher] Expiring stale team session: ${sessionId}`);
    // Remove all agents belonging to this team
    const teamName = stateManager.getSessions().get(sessionId)?.teamName;
    if (teamName) {
      for (const [agentId, agent] of stateManager.getAllAgents()) {
        if (agent.teamName === teamName) {
          stateManager.removeAgent(agentId);
        }
      }
    }
    stateManager.removeSession(sessionId);
    if (!stateManager.getState().session) {
      stateManager.selectMostInterestingSession();
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
}

/**
 * Periodically checks for stale sessions and cleans up orphaned subagents.
 * Returns an interval handle for cleanup.
 */
export function startStalenessChecker(ctx: WatcherContext) {
  const stalenessInterval = setInterval(() => runStalenessCheck(ctx), STALENESS_CHECK_INTERVAL_MS);
  return stalenessInterval;
}
