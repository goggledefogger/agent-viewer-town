/**
 * Team coordination tool handlers — extracts data from PostToolUse events
 * for team management tools (TeamCreate, TeamDelete, TaskCreate, TaskUpdate,
 * SendMessage) and handles TeammateIdle and TaskCompleted lifecycle events.
 */

import type { StateManager } from '../state';
import type { PostToolUseEvent, TeammateIdleEvent, TaskCompletedEvent } from './types';
import { inferRole } from '../parser';

/** Resolve an agent name from a session ID */
function resolveAgentName(stateManager: StateManager, sessionId: string): string {
  const agent = stateManager.getAgentById(sessionId);
  return agent?.name || sessionId.slice(0, 8);
}

/** Extract SendMessage data and add to message log */
export function extractMessage(stateManager: StateManager, event: PostToolUseEvent, sessionId: string) {
  const input = event.tool_input;
  if (!input) return;

  const msgType = typeof input.type === 'string' ? input.type : 'message';
  const content = typeof input.content === 'string' ? input.content : '';
  const recipient = typeof input.recipient === 'string' ? input.recipient : '';
  const summary = typeof input.summary === 'string' ? input.summary : '';

  if (!content && !summary) return;

  const fromName = resolveAgentName(stateManager, sessionId);

  if (msgType === 'broadcast') {
    stateManager.addMessage({
      id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
      from: fromName,
      to: 'team (broadcast)',
      content: summary || content.slice(0, 200),
      timestamp: Date.now(),
    });
  } else if (msgType === 'shutdown_request') {
    stateManager.addMessage({
      id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
      from: fromName,
      to: recipient,
      content: `Shutdown request: ${content || 'wrapping up'}`,
      timestamp: Date.now(),
    });
  } else if (msgType === 'message' && recipient) {
    stateManager.addMessage({
      id: `hook-msg-${sessionId.slice(0, 8)}-${Date.now()}`,
      from: fromName,
      to: recipient,
      content: summary || content.slice(0, 200),
      timestamp: Date.now(),
    });
  }
}

/** Extract TeamCreate data and register team immediately */
export function extractTeamCreate(stateManager: StateManager, event: PostToolUseEvent, sessionId: string) {
  const input = event.tool_input;
  const response = event.tool_response;
  if (!input) return;

  const teamName = typeof input.team_name === 'string' ? input.team_name : '';
  if (!teamName) return;

  console.log(`[hooks] TeamCreate detected: ${teamName} session=${sessionId.slice(0, 8)}`);
  stateManager.setTeamName(teamName);

  // If response contains member info, register agents
  if (response && typeof response === 'object') {
    const members = Array.isArray((response as Record<string, unknown>).members)
      ? (response as Record<string, unknown>).members as Array<Record<string, string>>
      : [];
    for (const member of members) {
      const name = member.name || member.agent_id || 'unknown';
      const role = inferRole(member.agent_type || '', name);
      stateManager.registerAgent({
        id: member.agent_id || name,
        name,
        role: role as 'lead' | 'researcher' | 'implementer' | 'tester' | 'planner',
        status: 'idle',
        tasksCompleted: 0,
      });
      stateManager.updateAgent({
        id: member.agent_id || name,
        name,
        role: role as 'lead' | 'researcher' | 'implementer' | 'tester' | 'planner',
        status: 'idle',
        tasksCompleted: 0,
      });
    }
  }

  stateManager.addMessage({
    id: `hook-team-${Date.now()}`,
    from: 'system',
    to: 'all',
    content: `Team "${teamName}" created`,
    timestamp: Date.now(),
  });
}

/** Handle TeamDelete — clear team state */
export function extractTeamDelete(stateManager: StateManager, sessionId: string) {
  console.log(`[hooks] TeamDelete detected: session=${sessionId.slice(0, 8)}`);
  stateManager.clearTeamAgents();
  stateManager.addMessage({
    id: `hook-team-${Date.now()}`,
    from: 'system',
    to: 'all',
    content: 'Team deleted',
    timestamp: Date.now(),
  });
}

/** Extract TaskCreate data for immediate task tracking */
export function extractTaskCreate(stateManager: StateManager, event: PostToolUseEvent, sessionId: string) {
  const input = event.tool_input;
  const response = event.tool_response;
  if (!input) return;

  const subject = typeof input.subject === 'string' ? input.subject : '';
  const description = typeof input.description === 'string' ? input.description : '';

  // Try to get the task ID from the response
  let taskId = '';
  if (response && typeof response === 'object') {
    const resStr = typeof (response as Record<string, unknown>).result === 'string'
      ? (response as Record<string, unknown>).result as string
      : JSON.stringify(response);
    const match = resStr.match(/Task #(\d+)/);
    if (match) taskId = match[1];
  }
  if (!taskId) taskId = `hook-${Date.now()}`;

  console.log(`[hooks] TaskCreate: #${taskId} "${subject}" session=${sessionId.slice(0, 8)}`);

  stateManager.updateTask({
    id: taskId,
    subject: subject || description.slice(0, 60) || 'Untitled task',
    status: 'pending',
    owner: undefined,
    blockedBy: [],
    blocks: [],
  });
}

/** Extract TaskUpdate data for immediate status tracking */
export function extractTaskUpdate(stateManager: StateManager, event: PostToolUseEvent, sessionId: string) {
  const input = event.tool_input;
  if (!input) return;

  const taskId = typeof input.taskId === 'string' ? input.taskId : '';
  if (!taskId) return;

  const status = typeof input.status === 'string' ? input.status : undefined;
  const owner = typeof input.owner === 'string' ? input.owner : undefined;

  // Find existing task and merge updates
  const existing = stateManager.getState().tasks.find(t => t.id === taskId);
  if (existing) {
    const updated = { ...existing };
    if (status === 'pending' || status === 'in_progress' || status === 'completed') {
      updated.status = status;
    }
    if (owner !== undefined) {
      updated.owner = owner;
    }
    if (status === 'deleted') {
      stateManager.removeTask(taskId);
      console.log(`[hooks] TaskUpdate: #${taskId} deleted session=${sessionId.slice(0, 8)}`);
      return;
    }
    stateManager.updateTask(updated);
    console.log(`[hooks] TaskUpdate: #${taskId} → ${status || 'updated'} owner=${owner || existing.owner || 'none'} session=${sessionId.slice(0, 8)}`);

    // Track currentTaskId on the owning agent
    const taskOwner = updated.owner || existing.owner;
    if (taskOwner) {
      const agent = stateManager.getState().agents.find(a => a.name === taskOwner);
      if (agent) {
        if (updated.status === 'in_progress') {
          stateManager.setAgentCurrentTask(agent.id, taskId);
        } else if (updated.status === 'completed' || updated.status === 'pending') {
          if (agent.currentTaskId === taskId) {
            stateManager.setAgentCurrentTask(agent.id, undefined);
          }
        }
      }
    }
  }

  stateManager.reconcileAgentStatuses();
}

export function handleTeammateIdle(stateManager: StateManager, event: TeammateIdleEvent, sessionId: string) {
  const teammateName = event.teammate_name;
  const teamName = event.team_name;
  console.log(`[hooks] TeammateIdle: ${teammateName || sessionId.slice(0, 8)} team=${teamName || 'unknown'}`);

  if (teammateName) {
    stateManager.updateAgentActivity(teammateName, 'idle');
    stateManager.setAgentWaiting(teammateName, false);
  } else {
    stateManager.updateAgentActivityById(sessionId, 'idle');
    stateManager.setAgentWaitingById(sessionId, false);
  }
}

export function handleTaskCompleted(stateManager: StateManager, event: TaskCompletedEvent, sessionId: string) {
  const taskId = event.task_id;
  const taskSubject = event.task_subject;
  const teammateName = event.teammate_name;
  console.log(`[hooks] TaskCompleted: #${taskId} "${taskSubject}" by ${teammateName || sessionId.slice(0, 8)}`);

  // Update the task status if we're tracking it
  if (taskId) {
    const existing = stateManager.getState().tasks.find(t => t.id === taskId);
    if (existing) {
      stateManager.updateTask({
        ...existing,
        status: 'completed',
        owner: teammateName || existing.owner,
      });
    }
  }

  // Increment tasksCompleted for the agent
  if (teammateName) {
    const agents = stateManager.getState().agents;
    const agent = agents.find(a => a.name === teammateName);
    if (agent) {
      agent.tasksCompleted += 1;
      stateManager.updateAgent(agent);
    }
  }

  stateManager.reconcileAgentStatuses();
}
