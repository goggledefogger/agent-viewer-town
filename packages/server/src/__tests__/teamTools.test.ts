import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateManager } from '../state';
import {
  extractMessage,
  extractTeamCreate,
  extractTeamDelete,
  extractTaskCreate,
  extractTaskUpdate,
  handleTeammateIdle,
  handleTaskCompleted,
} from '../hooks/teamTools';
import type { PostToolUseEvent, TeammateIdleEvent, TaskCompletedEvent } from '../hooks/types';

describe('teamTools', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
    vi.spyOn(stateManager, 'addMessage');
    vi.spyOn(stateManager, 'getAgentById');
    vi.spyOn(stateManager, 'registerAgent');
    vi.spyOn(stateManager, 'updateAgent');
    vi.spyOn(stateManager, 'setTeamName');
    vi.spyOn(stateManager, 'clearTeamAgents');
    vi.spyOn(stateManager, 'updateTask');
    vi.spyOn(stateManager, 'removeTask');
    vi.spyOn(stateManager, 'setAgentCurrentTask');
    vi.spyOn(stateManager, 'updateAgentActivity');
    vi.spyOn(stateManager, 'setAgentWaiting');
    vi.spyOn(stateManager, 'updateAgentActivityById');
    vi.spyOn(stateManager, 'setAgentWaitingById');
    vi.spyOn(stateManager, 'reconcileAgentStatuses');
  });

  describe('extractMessage', () => {
    it('should return early if tool_input is missing', () => {
      const event = { tool_name: 'SendMessage' } as PostToolUseEvent;
      extractMessage(stateManager, event, 'session-1');
      expect(stateManager.addMessage).not.toHaveBeenCalled();
    });

    it('should return early if content and summary are missing', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: { type: 'message' },
      } as unknown as PostToolUseEvent;
      extractMessage(stateManager, event, 'session-1');
      expect(stateManager.addMessage).not.toHaveBeenCalled();
    });

    it('should handle broadcast messages', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'broadcast',
          content: 'Hello team',
          summary: 'Greeting',
        },
      } as unknown as PostToolUseEvent;

      vi.spyOn(stateManager, 'getAgentById').mockReturnValue({ name: 'Alice' } as any);

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        from: 'Alice',
        to: 'team (broadcast)',
        content: 'Greeting',
      }));
    });

    it('should fallback to session ID slice if agent name is not resolved', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'broadcast',
          content: 'Hello team',
        },
      } as unknown as PostToolUseEvent;

      vi.spyOn(stateManager, 'getAgentById').mockReturnValue(undefined);

      extractMessage(stateManager, event, 'session-1-long-id');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        from: 'session-',
        to: 'team (broadcast)',
        content: 'Hello team',
      }));
    });

    it('should handle shutdown_request messages', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'shutdown_request',
          recipient: 'Bob',
          content: 'Work finished',
        },
      } as unknown as PostToolUseEvent;

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        to: 'Bob',
        content: 'Shutdown request: Work finished',
      }));
    });

    it('should use default message if shutdown_request content is missing', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'shutdown_request',
          recipient: 'Bob',
        },
      } as unknown as PostToolUseEvent;

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        content: 'Shutdown request: wrapping up',
      }));
    });

    it('should handle direct messages with recipient', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'message',
          recipient: 'Charlie',
          content: 'Private message',
        },
      } as unknown as PostToolUseEvent;

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        to: 'Charlie',
        content: 'Private message',
      }));
    });

    it('should not add message if type is message but recipient is missing', () => {
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'message',
          content: 'No recipient',
        },
      } as unknown as PostToolUseEvent;

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).not.toHaveBeenCalled();
    });

    it('should truncate content to 200 chars if summary is missing', () => {
      const longContent = 'a'.repeat(300);
      const event = {
        tool_name: 'SendMessage',
        tool_input: {
          type: 'broadcast',
          content: longContent,
        },
      } as unknown as PostToolUseEvent;

      extractMessage(stateManager, event, 'session-1');

      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        content: 'a'.repeat(200),
      }));
    });
  });

  describe('extractTeamCreate', () => {
    it('should return early if tool_input is missing', () => {
      const event = { tool_name: 'TeamCreate' } as PostToolUseEvent;
      extractTeamCreate(stateManager, event, 'session-1');
      expect(stateManager.setTeamName).not.toHaveBeenCalled();
    });

    it('should return early if team_name is missing', () => {
      const event = {
        tool_name: 'TeamCreate',
        tool_input: {},
      } as unknown as PostToolUseEvent;
      extractTeamCreate(stateManager, event, 'session-1');
      expect(stateManager.setTeamName).not.toHaveBeenCalled();
    });

    it('should set team name and register agents from response', () => {
      const event = {
        tool_name: 'TeamCreate',
        tool_input: { team_name: 'Alpha' },
        tool_response: {
          members: [
            { name: 'Alice', agent_id: 'a1', agent_type: 'Lead' },
          ],
        },
      } as unknown as PostToolUseEvent;

      extractTeamCreate(stateManager, event, 'session-1');

      expect(stateManager.setTeamName).toHaveBeenCalledWith('Alpha');
      expect(stateManager.registerAgent).toHaveBeenCalledWith(expect.objectContaining({
        id: 'a1',
        name: 'Alice',
        role: 'lead',
      }));
      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        content: 'Team "Alpha" created',
      }));
    });

    it('should use fallback for member name and role', () => {
      const event = {
        tool_name: 'TeamCreate',
        tool_input: { team_name: 'Alpha' },
        tool_response: {
          members: [
            { agent_id: 'a1' },
          ],
        },
      } as unknown as PostToolUseEvent;

      extractTeamCreate(stateManager, event, 'session-1');

      expect(stateManager.registerAgent).toHaveBeenCalledWith(expect.objectContaining({
        id: 'a1',
        name: 'a1',
        role: 'implementer',
      }));
    });
  });

  describe('extractTeamDelete', () => {
    it('should clear team agents and add message', () => {
      extractTeamDelete(stateManager, 'session-1');
      expect(stateManager.clearTeamAgents).toHaveBeenCalled();
      expect(stateManager.addMessage).toHaveBeenCalledWith(expect.objectContaining({
        content: 'Team deleted',
      }));
    });
  });

  describe('extractTaskCreate', () => {
    it('should return early if tool_input is missing', () => {
      const event = { tool_name: 'TaskCreate' } as PostToolUseEvent;
      extractTaskCreate(stateManager, event, 'session-1');
      expect(stateManager.updateTask).not.toHaveBeenCalled();
    });

    it('should create task with ID from response', () => {
      const event = {
        tool_name: 'TaskCreate',
        tool_input: { subject: 'Task 1' },
        tool_response: { result: 'Task #123 created' },
      } as unknown as PostToolUseEvent;

      extractTaskCreate(stateManager, event, 'session-1');

      expect(stateManager.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        subject: 'Task 1',
      }));
    });

    it('should use fallback task ID if not in response', () => {
      const event = {
        tool_name: 'TaskCreate',
        tool_input: { subject: 'Task 1' },
        tool_response: {},
      } as unknown as PostToolUseEvent;

      extractTaskCreate(stateManager, event, 'session-1');

      expect(stateManager.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.stringMatching(/^hook-/),
        subject: 'Task 1',
      }));
    });

    it('should use description slice as subject if subject is missing', () => {
      const event = {
        tool_name: 'TaskCreate',
        tool_input: { description: 'A'.repeat(100) },
      } as unknown as PostToolUseEvent;

      extractTaskCreate(stateManager, event, 'session-1');

      expect(stateManager.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        subject: 'A'.repeat(60),
      }));
    });
  });

  describe('extractTaskUpdate', () => {
    it('should return early if tool_input is missing', () => {
      const event = { tool_name: 'TaskUpdate' } as PostToolUseEvent;
      extractTaskUpdate(stateManager, event, 'session-1');
      expect(stateManager.updateTask).not.toHaveBeenCalled();
    });

    it('should return early if taskId is missing', () => {
      const event = {
        tool_name: 'TaskUpdate',
        tool_input: {},
      } as unknown as PostToolUseEvent;
      extractTaskUpdate(stateManager, event, 'session-1');
      expect(stateManager.updateTask).not.toHaveBeenCalled();
    });

    it('should remove task if status is deleted', () => {
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [{ id: '123', subject: 'T1', status: 'pending' }],
      } as any);

      const event = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '123', status: 'deleted' },
      } as unknown as PostToolUseEvent;

      extractTaskUpdate(stateManager, event, 'session-1');

      expect(stateManager.removeTask).toHaveBeenCalledWith('123');
    });

    it('should update task status and owner', () => {
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [{ id: '123', subject: 'T1', status: 'pending', owner: 'Alice' }],
        agents: [],
      } as any);

      const event = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '123', status: 'in_progress', owner: 'Bob' },
      } as unknown as PostToolUseEvent;

      extractTaskUpdate(stateManager, event, 'session-1');

      expect(stateManager.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        status: 'in_progress',
        owner: 'Bob',
      }));
    });

    it('should update agent current task if in_progress', () => {
      const agent = { id: 'a1', name: 'Bob', currentTaskId: undefined };
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [{ id: '123', subject: 'T1', status: 'pending' }],
        agents: [agent],
      } as any);

      const event = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '123', status: 'in_progress', owner: 'Bob' },
      } as unknown as PostToolUseEvent;

      extractTaskUpdate(stateManager, event, 'session-1');

      expect(stateManager.setAgentCurrentTask).toHaveBeenCalledWith('a1', '123');
    });

    it('should clear agent current task if completed', () => {
      const agent = { id: 'a1', name: 'Bob', currentTaskId: '123' };
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [{ id: '123', subject: 'T1', status: 'in_progress', owner: 'Bob' }],
        agents: [agent],
      } as any);

      const event = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '123', status: 'completed' },
      } as unknown as PostToolUseEvent;

      extractTaskUpdate(stateManager, event, 'session-1');

      expect(stateManager.setAgentCurrentTask).toHaveBeenCalledWith('a1', undefined);
    });

    it('should reconcile agent statuses', () => {
      const event = {
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '123', status: 'completed' },
      } as unknown as PostToolUseEvent;

      extractTaskUpdate(stateManager, event, 'session-1');
      expect(stateManager.reconcileAgentStatuses).toHaveBeenCalled();
    });
  });

  describe('handleTeammateIdle', () => {
    it('should update agent by name if provided', () => {
      const event = { teammate_name: 'Alice' } as TeammateIdleEvent;
      handleTeammateIdle(stateManager, event, 'session-1');
      expect(stateManager.updateAgentActivity).toHaveBeenCalledWith('Alice', 'idle');
      expect(stateManager.setAgentWaiting).toHaveBeenCalledWith('Alice', false);
    });

    it('should update agent by session ID if name is missing', () => {
      const event = {} as TeammateIdleEvent;
      handleTeammateIdle(stateManager, event, 'session-1');
      expect(stateManager.updateAgentActivityById).toHaveBeenCalledWith('session-1', 'idle');
      expect(stateManager.setAgentWaitingById).toHaveBeenCalledWith('session-1', false);
    });
  });

  describe('handleTaskCompleted', () => {
    it('should update task status to completed', () => {
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [{ id: '123', subject: 'T1', status: 'in_progress', owner: 'Alice' }],
        agents: [],
      } as any);

      const event = { task_id: '123', teammate_name: 'Alice' } as TaskCompletedEvent;
      handleTaskCompleted(stateManager, event, 'session-1');

      expect(stateManager.updateTask).toHaveBeenCalledWith(expect.objectContaining({
        id: '123',
        status: 'completed',
        owner: 'Alice',
      }));
    });

    it('should increment tasksCompleted for the agent', () => {
      const agent = { id: 'a1', name: 'Alice', tasksCompleted: 5 };
      vi.spyOn(stateManager, 'getState').mockReturnValue({
        tasks: [],
        agents: [agent],
      } as any);

      const event = { teammate_name: 'Alice' } as TaskCompletedEvent;
      handleTaskCompleted(stateManager, event, 'session-1');

      expect(stateManager.updateAgent).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Alice',
        tasksCompleted: 6,
      }));
    });

    it('should reconcile agent statuses', () => {
      const event = { task_id: '123' } as TaskCompletedEvent;
      handleTaskCompleted(stateManager, event, 'session-1');
      expect(stateManager.reconcileAgentStatuses).toHaveBeenCalled();
    });
  });
});
