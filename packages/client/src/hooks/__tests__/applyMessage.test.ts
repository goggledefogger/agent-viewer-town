import { describe, it, expect } from 'vitest';
import { applyMessage } from '../useWebSocket';
import type { TeamState, AgentState, TaskState, MessageState, WSMessage } from '@agent-viewer/shared';

const initialTeamState: TeamState = {
  name: 'Test Team',
  agents: [],
  tasks: [],
  messages: [],
};

describe('applyMessage', () => {
  it('should handle full_state', () => {
    const newState: TeamState = {
      name: 'New Team',
      agents: [{ id: '1', name: 'Agent 1', role: 'lead', status: 'idle', tasksCompleted: 0 }],
      tasks: [],
      messages: [],
    };
    const message: WSMessage = { type: 'full_state', data: newState };

    const result = applyMessage(initialTeamState, message);
    expect(result).toEqual(newState);
  });

  it('should handle agent_update', () => {
    const stateWithAgent: TeamState = {
      ...initialTeamState,
      agents: [{ id: '1', name: 'Agent 1', role: 'lead', status: 'idle', tasksCompleted: 0 }],
    };
    const updatedAgent: AgentState = { id: '1', name: 'Agent 1 Updated', role: 'lead', status: 'working', tasksCompleted: 1 };
    const message: WSMessage = { type: 'agent_update', data: updatedAgent };

    const result = applyMessage(stateWithAgent, message);
    expect(result.agents[0]).toEqual(updatedAgent);
    expect(result.agents.length).toBe(1);
  });

  it('should not update any agent if ID does not match in agent_update', () => {
    const stateWithAgent: TeamState = {
      ...initialTeamState,
      agents: [{ id: '1', name: 'Agent 1', role: 'lead', status: 'idle', tasksCompleted: 0 }],
    };
    const updatedAgent: AgentState = { id: '2', name: 'Agent 2', role: 'tester', status: 'working', tasksCompleted: 1 };
    const message: WSMessage = { type: 'agent_update', data: updatedAgent };

    const result = applyMessage(stateWithAgent, message);
    expect(result.agents[0].id).toBe('1');
    expect(result.agents.length).toBe(1);
  });

  it('should handle agent_added', () => {
    const newAgent: AgentState = { id: '2', name: 'Agent 2', role: 'tester', status: 'idle', tasksCompleted: 0 };
    const message: WSMessage = { type: 'agent_added', data: newAgent };

    const result = applyMessage(initialTeamState, message);
    expect(result.agents).toContainEqual(newAgent);
    expect(result.agents.length).toBe(1);
  });

  it('should handle agent_removed', () => {
    const stateWithAgents: TeamState = {
      ...initialTeamState,
      agents: [
        { id: '1', name: 'Agent 1', role: 'lead', status: 'idle', tasksCompleted: 0 },
        { id: '2', name: 'Agent 2', role: 'tester', status: 'idle', tasksCompleted: 0 },
      ],
    };
    const message: WSMessage = { type: 'agent_removed', data: { id: '1' } };

    const result = applyMessage(stateWithAgents, message);
    expect(result.agents.length).toBe(1);
    expect(result.agents[0].id).toBe('2');
  });

  it('should handle task_update for existing task', () => {
    const stateWithTask: TeamState = {
      ...initialTeamState,
      tasks: [{ id: 't1', subject: 'Task 1', status: 'pending', blockedBy: [], blocks: [] }],
    };
    const updatedTask: TaskState = { id: 't1', subject: 'Task 1 Updated', status: 'in_progress', blockedBy: [], blocks: [] };
    const message: WSMessage = { type: 'task_update', data: updatedTask };

    const result = applyMessage(stateWithTask, message);
    expect(result.tasks[0]).toEqual(updatedTask);
    expect(result.tasks.length).toBe(1);
  });

  it('should handle task_update for new task', () => {
    const newTask: TaskState = { id: 't2', subject: 'Task 2', status: 'pending', blockedBy: [], blocks: [] };
    const message: WSMessage = { type: 'task_update', data: newTask };

    const result = applyMessage(initialTeamState, message);
    expect(result.tasks).toContainEqual(newTask);
    expect(result.tasks.length).toBe(1);
  });

  it('should handle new_message', () => {
    const newMessage: MessageState = { id: 'm1', from: 'A', to: 'B', content: 'Hello', timestamp: Date.now() };
    const message: WSMessage = { type: 'new_message', data: newMessage };

    const result = applyMessage(initialTeamState, message);
    expect(result.messages).toContainEqual(newMessage);
    expect(result.messages.length).toBe(1);
  });

  it('should return current state for unknown message type', () => {
    // @ts-expect-error - testing default case with unknown type
    const message: WSMessage = { type: 'unknown_type', data: {} };

    const result = applyMessage(initialTeamState, message);
    expect(result).toBe(initialTeamState);
  });
});
