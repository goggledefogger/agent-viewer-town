/**
 * Subagent lifecycle handlers — SubagentStart/Stop events
 * and pending Task spawn correlation (FIFO matching).
 */

import type { StateManager } from '../state';
import type { SubagentStartEvent, SubagentStopEvent, PendingSpawn } from './types';
import { inferRole } from '../parser';

/** Clean up old pending spawns (> 60s) */
export function cleanPendingSpawns(pendingTaskSpawns: Map<string, PendingSpawn>) {
  const now = Date.now();
  for (const [key, val] of pendingTaskSpawns) {
    if (now - val.timestamp > 60_000) {
      pendingTaskSpawns.delete(key);
    }
  }
}

export function handleSubagentStart(
  stateManager: StateManager,
  event: SubagentStartEvent,
  sessionId: string,
  pendingTaskSpawns: Map<string, PendingSpawn>,
) {
  const agentId = event.agent_id;

  // Try to find the description from a pending Task spawn
  let name = event.agent_type || 'subagent';
  let role: 'implementer' | 'researcher' | 'planner' = 'implementer';
  let teamName: string | undefined;
  let subagentType: string | undefined = event.agent_type || undefined;

  // Find the oldest pending spawn from this session (FIFO order) and consume it.
  // This correctly handles simultaneous subagent spawns: each SubagentStart
  // consumes the earliest unused Task tool call from the same session.
  let bestKey: string | undefined;
  let bestTimestamp = Infinity;
  for (const [key, spawn] of pendingTaskSpawns) {
    if (spawn.sessionId === sessionId && spawn.timestamp < bestTimestamp) {
      bestKey = key;
      bestTimestamp = spawn.timestamp;
    }
  }
  if (bestKey) {
    const bestMatch = pendingTaskSpawns.get(bestKey)!;
    name = bestMatch.description || bestMatch.prompt || name;
    role = inferRole(bestMatch.subagentType, name) as typeof role;
    teamName = bestMatch.teamName;
    subagentType = bestMatch.subagentType || subagentType;
    // Consume this spawn entry so the next SubagentStart gets a different one
    pendingTaskSpawns.delete(bestKey);
  }

  // Clear any recently-removed flag so legitimate re-spawns can register.
  // This handles the case where a subagent with the same ID is spawned again
  // after a previous one was stopped and removed.
  stateManager.clearRecentlyRemoved(agentId);

  // If the spawn had a team_name, this is a team member — not a subagent.
  // Team members are top-level agents that participate in the team workflow.
  const isTeamMember = !!teamName;

  // Register and display the agent
  const agent = {
    id: agentId,
    name,
    role,
    status: 'working' as const,
    tasksCompleted: 0,
    isSubagent: !isTeamMember,
    parentAgentId: isTeamMember ? undefined : sessionId,
    teamName,
    subagentType: isTeamMember ? undefined : subagentType,
  };
  stateManager.registerAgent(agent);
  stateManager.updateAgent(agent);

  console.log(`[hooks] SubagentStart: ${agentId} parent=${sessionId.slice(0, 8)} name="${name}" type=${event.agent_type} team=${teamName || 'none'}`);
}

export function handleSubagentStop(
  stateManager: StateManager,
  event: SubagentStopEvent,
  sessionId: string,
) {
  const agentId = event.agent_id;
  const agent = stateManager.getAgentById(agentId);
  if (agent) {
    // Team members transition to idle (they persist); subagents transition to done
    if (agent.teamName) {
      stateManager.updateAgentActivityById(agentId, 'idle');
    } else {
      stateManager.updateAgentActivityById(agentId, 'done', 'Done');
      // Mark as stopped to prevent watcher resurrection from trailing logs
      // during the 15s done→removal window (defense-in-depth with removedAgents)
      stateManager.markSessionStopped(agentId);
    }
  }
  console.log(`[hooks] SubagentStop: ${agentId} parent=${sessionId.slice(0, 8)}`);

  // Only schedule removal for subagents (not team members)
  // Brief delay so user can see the done checkmark before removal
  if (!agent?.teamName) {
    setTimeout(() => {
      stateManager.removeAgent(agentId);
    }, 15_000);
  }
}
