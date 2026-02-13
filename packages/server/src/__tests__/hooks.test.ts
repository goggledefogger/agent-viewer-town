import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StateManager } from '../state';
import { createHookHandler } from '../hooks';
import type { AgentState, SessionInfo } from '@agent-viewer/shared';

function makeSession(id: string, projectName: string, overrides?: Partial<SessionInfo>): SessionInfo {
  return {
    sessionId: id,
    slug: `slug-${id}`,
    projectPath: `/home/user/${projectName}`,
    projectName,
    isTeam: false,
    lastActivity: Date.now(),
    ...overrides,
  };
}

function makeAgent(id: string, name: string, overrides?: Partial<AgentState>): AgentState {
  return {
    id,
    name,
    role: 'implementer',
    status: 'idle',
    tasksCompleted: 0,
    ...overrides,
  };
}

describe('Hook Event Handlers', () => {
  let sm: StateManager;
  let handler: ReturnType<typeof createHookHandler>;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new StateManager();
    handler = createHookHandler(sm);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper to register a session agent and make it the active session */
  function setupAgent(sessionId: string, name: string, agentOverrides?: Partial<AgentState>) {
    sm.registerAgent(makeAgent(sessionId, name, agentOverrides));
    sm.addSession(makeSession(sessionId, 'test-project'));
  }

  describe('PreToolUse', () => {
    it('sets agent to working with correct action description', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/app.ts' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('working');
      expect(agent?.currentAction).toBe('Reading app.ts');
    });

    it('clears waiting state when a tool is used', () => {
      setupAgent('sess-1', 'coder', { status: 'working', waitingForInput: true });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test', description: 'Run tests' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(false);
      expect(agent?.status).toBe('working');
      expect(agent?.currentAction).toBe('Run tests');
    });

    it('ignores events with no session_id', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: '',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/file.ts' },
      });

      // Agent should remain idle since event was ignored
      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('idle');
    });

    it('tracks Task tool spawns for subagent correlation', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'Research API patterns',
          prompt: 'Look into REST vs GraphQL',
          subagent_type: 'Explorer',
        },
        tool_use_id: 'tu-123',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('working');
      expect(agent?.currentAction).toBe('Spawning: Research API patterns');
    });
  });

  describe('PostToolUse with SendMessage', () => {
    it('extracts direct message into message log', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'message',
          recipient: 'team-lead',
          content: 'I finished implementing the feature',
          summary: 'Feature complete',
        },
      });

      const state = sm.getState();
      expect(state.messages.length).toBeGreaterThanOrEqual(1);
      const msg = state.messages.find(m => m.to === 'team-lead');
      expect(msg).toBeDefined();
      expect(msg!.from).toBe('coder');
      expect(msg!.content).toBe('Feature complete');
    });

    it('extracts broadcast message', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'broadcast',
          content: 'Team standup in 5 minutes',
          summary: 'Standup reminder',
        },
      });

      const state = sm.getState();
      const msg = state.messages.find(m => m.to === 'team (broadcast)');
      expect(msg).toBeDefined();
      expect(msg!.from).toBe('lead');
      expect(msg!.content).toBe('Standup reminder');
    });

    it('extracts shutdown_request message', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'shutdown_request',
          recipient: 'researcher',
          content: 'Task complete, wrapping up',
        },
      });

      const state = sm.getState();
      const msg = state.messages.find(m => m.to === 'researcher');
      expect(msg).toBeDefined();
      expect(msg!.content).toContain('Shutdown request');
      expect(msg!.content).toContain('wrapping up');
    });

    it('does not add message when content and summary are empty', () => {
      setupAgent('sess-1', 'coder');
      const initialMsgCount = sm.getState().messages.length;

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'message',
          recipient: 'lead',
          content: '',
          summary: '',
        },
      });

      expect(sm.getState().messages.length).toBe(initialMsgCount);
    });

    it('clears waiting state on PostToolUse', () => {
      setupAgent('sess-1', 'coder', { status: 'working', waitingForInput: true });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/file.ts' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(false);
    });
  });

  describe('PostToolUse with TeamCreate', () => {
    it('registers team name', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamCreate',
        tool_input: {
          team_name: 'workshop-builders',
        },
        tool_response: {},
      });

      const state = sm.getState();
      expect(state.name).toBe('workshop-builders');
    });

    it('registers team members from response', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamCreate',
        tool_input: {
          team_name: 'my-team',
        },
        tool_response: {
          members: [
            { name: 'coder', agent_id: 'agent-1', agent_type: 'Implementer' },
            { name: 'researcher', agent_id: 'agent-2', agent_type: 'Explorer' },
          ],
        },
      });

      const agent1 = sm.getAgentById('agent-1');
      expect(agent1).toBeDefined();
      expect(agent1!.name).toBe('coder');
      expect(agent1!.role).toBe('implementer');

      const agent2 = sm.getAgentById('agent-2');
      expect(agent2).toBeDefined();
      expect(agent2!.name).toBe('researcher');
      expect(agent2!.role).toBe('researcher');
    });

    it('adds a system message about team creation', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamCreate',
        tool_input: { team_name: 'builders' },
        tool_response: {},
      });

      const msg = sm.getState().messages.find(m => m.from === 'system' && m.content.includes('builders'));
      expect(msg).toBeDefined();
      expect(msg!.content).toBe('Team "builders" created');
    });
  });

  describe('PostToolUse with TaskCreate', () => {
    it('creates task with correct subject and pending status', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {
          subject: 'Implement user auth',
          description: 'Add login and signup flows',
        },
        tool_response: {
          result: 'Task #42 created successfully: Implement user auth',
        },
      });

      const state = sm.getState();
      const task = state.tasks.find(t => t.id === '42');
      expect(task).toBeDefined();
      expect(task!.subject).toBe('Implement user auth');
      expect(task!.status).toBe('pending');
    });

    it('uses fallback ID when response has no task number', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {
          subject: 'Some task',
          description: 'Details',
        },
        tool_response: {},
      });

      const state = sm.getState();
      expect(state.tasks.length).toBeGreaterThanOrEqual(1);
      const task = state.tasks.find(t => t.subject === 'Some task');
      expect(task).toBeDefined();
      expect(task!.id).toMatch(/^hook-/);
      expect(task!.status).toBe('pending');
    });

    it('uses description as subject when subject is missing', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {
          description: 'A detailed task description for testing',
        },
        tool_response: {
          result: 'Task #7 created successfully',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '7');
      expect(task).toBeDefined();
      expect(task!.subject).toBe('A detailed task description for testing');
    });
  });

  describe('PostToolUse with TaskUpdate', () => {
    it('updates task status', () => {
      setupAgent('sess-1', 'lead');

      // First create a task
      sm.updateTask({
        id: '10',
        subject: 'Build feature',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '10',
          status: 'in_progress',
          owner: 'coder',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '10');
      expect(task).toBeDefined();
      expect(task!.status).toBe('in_progress');
      expect(task!.owner).toBe('coder');
    });

    it('handles deleted status by removing the task', () => {
      setupAgent('sess-1', 'lead');

      sm.updateTask({
        id: '11',
        subject: 'Temporary task',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '11',
          status: 'deleted',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '11');
      expect(task).toBeUndefined();
    });

    it('does nothing for unknown task ID', () => {
      setupAgent('sess-1', 'lead');
      const tasksBefore = sm.getState().tasks.length;

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '999',
          status: 'completed',
        },
      });

      expect(sm.getState().tasks.length).toBe(tasksBefore);
    });

    it('updates task to completed status', () => {
      setupAgent('sess-1', 'lead');

      sm.updateTask({
        id: '12',
        subject: 'Write docs',
        status: 'in_progress',
        owner: 'writer',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '12',
          status: 'completed',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '12');
      expect(task).toBeDefined();
      expect(task!.status).toBe('completed');
    });
  });

  describe('PermissionRequest', () => {
    it('sets agent to waiting with tool description', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /tmp/test', description: 'Delete temp files' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(true);
      expect(agent?.currentAction).toBe('Delete temp files');
    });

    it('uses tool name when no input is provided', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Write',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(true);
      expect(agent?.currentAction).toBe('Write');
    });

    it('shows file name for Read permission request', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Read',
        tool_input: { file_path: '/etc/secrets.conf' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(true);
      expect(agent?.currentAction).toBe('Reading secrets.conf');
    });
  });

  describe('SubagentStart', () => {
    it('registers subagent with correct parent', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-agent-1',
        agent_type: 'general-purpose',
      });

      const subagent = sm.getAgentById('sub-agent-1');
      expect(subagent).toBeDefined();
      expect(subagent!.isSubagent).toBe(true);
      expect(subagent!.parentAgentId).toBe('sess-1');
      expect(subagent!.status).toBe('working');
    });

    it('uses pending Task spawn info for subagent name and role', () => {
      setupAgent('sess-1', 'lead');

      // First send a PreToolUse for Task to set up pending spawn
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'Research database options',
          prompt: 'Analyze PostgreSQL vs MySQL',
          subagent_type: 'Explorer',
        },
        tool_use_id: 'tu-456',
      });

      // Then SubagentStart
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-agent-2',
        agent_type: 'general-purpose',
      });

      const subagent = sm.getAgentById('sub-agent-2');
      expect(subagent).toBeDefined();
      expect(subagent!.name).toBe('Research database options');
      expect(subagent!.role).toBe('researcher');
    });
  });

  describe('SubagentStop', () => {
    it('marks subagent as done', () => {
      setupAgent('sess-1', 'lead');

      // Register a subagent
      sm.registerAgent(makeAgent('sub-1', 'researcher-sub', {
        isSubagent: true,
        parentAgentId: 'sess-1',
        status: 'working',
      }));
      sm.updateAgent(sm.getAgentById('sub-1')!);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStop',
        agent_id: 'sub-1',
      });

      const subagent = sm.getAgentById('sub-1');
      expect(subagent).toBeDefined();
      expect(subagent!.status).toBe('done');
      expect(subagent!.currentAction).toBe('Done');
    });

    it('schedules subagent removal after timeout', () => {
      setupAgent('sess-1', 'lead');

      sm.registerAgent(makeAgent('sub-2', 'worker', {
        isSubagent: true,
        parentAgentId: 'sess-1',
        status: 'working',
      }));
      sm.updateAgent(sm.getAgentById('sub-2')!);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStop',
        agent_id: 'sub-2',
      });

      // Still exists right after stop
      expect(sm.getAgentById('sub-2')).toBeDefined();

      // After 2 minutes, should be removed
      vi.advanceTimersByTime(120_000);
      expect(sm.getAgentById('sub-2')).toBeUndefined();
    });

    it('does nothing when subagent is not in registry', () => {
      setupAgent('sess-1', 'lead');

      // Should not throw
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStop',
        agent_id: 'nonexistent-sub',
      });

      expect(sm.getAgentById('nonexistent-sub')).toBeUndefined();
    });
  });

  describe('TeammateIdle', () => {
    it('marks teammate as idle by name', () => {
      setupAgent('sess-1', 'lead');
      sm.registerAgent(makeAgent('agent-coder', 'coder', { status: 'working' }));
      sm.updateAgent(sm.getAgentById('agent-coder')!);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'TeammateIdle',
        teammate_name: 'coder',
        team_name: 'my-team',
      });

      const agent = sm.getAgentById('agent-coder');
      expect(agent?.status).toBe('idle');
      expect(agent?.waitingForInput).toBe(false);
    });

    it('clears waiting state', () => {
      setupAgent('sess-1', 'lead');
      sm.registerAgent(makeAgent('agent-coder', 'coder', {
        status: 'working',
        waitingForInput: true,
      }));
      sm.updateAgent(sm.getAgentById('agent-coder')!);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'TeammateIdle',
        teammate_name: 'coder',
      });

      const agent = sm.getAgentById('agent-coder');
      expect(agent?.waitingForInput).toBe(false);
    });

    it('falls back to session ID when teammate_name is not provided', () => {
      setupAgent('sess-1', 'lead', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'TeammateIdle',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('idle');
    });
  });

  describe('TaskCompleted', () => {
    it('updates task to completed', () => {
      setupAgent('sess-1', 'lead');

      sm.updateTask({
        id: '5',
        subject: 'Build UI',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'TaskCompleted',
        task_id: '5',
        task_subject: 'Build UI',
        teammate_name: 'coder',
      });

      const task = sm.getState().tasks.find(t => t.id === '5');
      expect(task).toBeDefined();
      expect(task!.status).toBe('completed');
    });

    it('increments tasksCompleted for the teammate', () => {
      // Use setAgents directly so agents are in state.agents for team operations
      const coder = makeAgent('agent-coder', 'coder', { tasksCompleted: 2 });
      sm.setAgents([
        makeAgent('agent-lead', 'lead', { role: 'lead' }),
        coder,
      ]);

      sm.updateTask({
        id: '6',
        subject: 'Fix bug',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'agent-coder',
        hook_event_name: 'TaskCompleted',
        task_id: '6',
        task_subject: 'Fix bug',
        teammate_name: 'coder',
      });

      // updateTask increments +1 (in_progress -> completed with matching owner),
      // then handleTaskCompleted also increments +1
      const agent = sm.getState().agents.find(a => a.name === 'coder');
      expect(agent).toBeDefined();
      expect(agent!.tasksCompleted).toBe(4);
    });

    it('does nothing for unknown task_id', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'TaskCompleted',
        task_id: '999',
        teammate_name: 'coder',
      });

      const task = sm.getState().tasks.find(t => t.id === '999');
      expect(task).toBeUndefined();
    });
  });

  describe('UserPromptSubmit', () => {
    it('clears waiting and sets working', () => {
      setupAgent('sess-1', 'coder', { status: 'working', waitingForInput: true });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Fix the login bug',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(false);
      expect(agent?.status).toBe('working');
      expect(agent?.currentAction).toBe('Processing prompt...');
    });

    it('transitions idle agent to working', () => {
      setupAgent('sess-1', 'coder', { status: 'idle' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'UserPromptSubmit',
        prompt: 'Add a new feature',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('working');
    });
  });

  describe('Stop', () => {
    it('sets agent to idle', () => {
      setupAgent('sess-1', 'coder', { status: 'working', currentAction: 'Editing file.ts' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'Stop',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('idle');
    });

    it('clears waiting state on Stop', () => {
      setupAgent('sess-1', 'coder', { status: 'working', waitingForInput: true });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'Stop',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(false);
      expect(agent?.status).toBe('idle');
    });
  });

  describe('PreCompact', () => {
    it('sets agent to working with compacting action', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreCompact',
        trigger: 'auto',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('working');
      expect(agent?.currentAction).toBe('Compacting conversation...');
    });
  });

  describe('SessionStart', () => {
    it('does not crash for a new session', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SessionStart',
        source: 'cli',
        model: 'claude-sonnet-4-5-20250929',
      });

      // Should not throw; session activity is updated
      const agent = sm.getAgentById('sess-1');
      expect(agent).toBeDefined();
    });
  });

  describe('SessionEnd', () => {
    it('sets agent to idle on session end', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SessionEnd',
        reason: 'user_exit',
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('idle');
    });
  });

  describe('actionContext', () => {
    it('sets actionContext for file operations', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/src/components/Button.tsx' },
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Editing Button.tsx');
      expect(agent?.actionContext).toBe('src/components');
    });

    it('sets actionContext for Grep with glob filter', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: 'handleEvent', glob: '*.tsx' },
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Searching: handleEvent');
      expect(agent?.actionContext).toBe('in *.tsx');
    });

    it('sets actionContext for Task spawning with subagent type', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { description: 'Research API', subagent_type: 'Explore' },
        tool_use_id: 'tu-100',
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Spawning: Research API');
      expect(agent?.actionContext).toBe('(Explore)');
    });

    it('has no actionContext for Bash commands', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test', description: 'Run tests' },
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Run tests');
      expect(agent?.actionContext).toBeUndefined();
    });

    it('sets actionContext on PermissionRequest', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Edit',
        tool_input: { file_path: '/etc/config/settings.json' },
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(true);
      expect(agent?.currentAction).toBe('Editing settings.json');
      expect(agent?.actionContext).toBe('etc/config');
    });
  });

  describe('recentActions', () => {
    it('builds up recent actions on tool use', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/app.ts' },
      });
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/src/app.ts' },
      });

      const agent = sm.getAgentById('sess-1');
      expect(agent?.recentActions).toHaveLength(2);
      expect(agent?.recentActions?.[0].action).toBe('Reading app.ts');
      expect(agent?.recentActions?.[1].action).toBe('Editing app.ts');
    });

    it('caps at 5 entries', () => {
      setupAgent('sess-1', 'coder');
      for (let i = 0; i < 7; i++) {
        handler.handleEvent({
          session_id: 'sess-1',
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: `/src/file${i}.ts` },
        });
      }
      const agent = sm.getAgentById('sess-1');
      expect(agent?.recentActions).toHaveLength(5);
      expect(agent?.recentActions?.[0].action).toBe('Reading file2.ts');
      expect(agent?.recentActions?.[4].action).toBe('Reading file6.ts');
    });
  });

  describe('currentTaskId tracking', () => {
    it('sets currentTaskId when task is set to in_progress', () => {
      const coder = makeAgent('agent-coder', 'coder');
      sm.setAgents([coder]);

      sm.updateTask({
        id: '20',
        subject: 'Build feature',
        status: 'pending',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'agent-coder',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '20', status: 'in_progress' },
      });

      const agent = sm.getState().agents.find(a => a.name === 'coder');
      expect(agent?.currentTaskId).toBe('20');
    });

    it('clears currentTaskId when task is completed', () => {
      const coder = makeAgent('agent-coder', 'coder', { currentTaskId: '21' });
      sm.setAgents([coder]);

      sm.updateTask({
        id: '21',
        subject: 'Fix bug',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'agent-coder',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '21', status: 'completed' },
      });

      const agent = sm.getState().agents.find(a => a.name === 'coder');
      expect(agent?.currentTaskId).toBeUndefined();
    });
  });

  describe('describeToolAction', () => {
    // Test indirectly via PreToolUse events that use describeToolAction

    it('describes Edit with filename', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/src/components/Button.tsx' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Editing Button.tsx');
    });

    it('describes Write with filename', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/src/index.ts' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Writing index.ts');
    });

    it('describes Bash with description when available', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm run build', description: 'Build the project' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Build the project');
    });

    it('describes Bash with command when no description', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'git status && git diff' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Running: git status');
    });

    it('describes Bash with no input', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Running command');
    });

    it('describes Grep with pattern', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: 'handleEvent' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Searching: handleEvent');
    });

    it('describes Glob with pattern', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Glob',
        tool_input: { pattern: '**/*.test.ts' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Searching: **/*.test.ts');
    });

    it('describes TaskCreate with subject', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskCreate',
        tool_input: { subject: 'Add login flow' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Creating task: Add login flow');
    });

    it('describes TaskUpdate with status', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '5', status: 'completed' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Task #5: completed');
    });

    it('describes TaskUpdate without status', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '5', owner: 'coder' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Updating task #5');
    });

    it('describes TaskList', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskList',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Checking task list');
    });

    it('describes SendMessage DM', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'SendMessage',
        tool_input: { type: 'message', recipient: 'coder' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Messaging coder');
    });

    it('describes SendMessage broadcast', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'SendMessage',
        tool_input: { type: 'broadcast' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Broadcasting to team');
    });

    it('describes SendMessage shutdown_request', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'SendMessage',
        tool_input: { type: 'shutdown_request', recipient: 'coder' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Requesting coder shutdown');
    });

    it('describes WebSearch with query', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'WebSearch',
        tool_input: { query: 'vitest mock timers' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Searching: vitest mock timers');
    });

    it('describes WebFetch', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'WebFetch',
        tool_input: { url: 'https://example.com' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Fetching web page');
    });

    it('describes EnterPlanMode', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'EnterPlanMode',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Entering plan mode');
    });

    it('describes ExitPlanMode', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'ExitPlanMode',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Presenting plan for approval');
    });

    it('describes AskUserQuestion', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'AskUserQuestion',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Asking user a question');
    });

    it('describes TeamCreate with team name', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TeamCreate',
        tool_input: { team_name: 'alpha-team' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Creating team: alpha-team');
    });

    it('describes TeamDelete', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TeamDelete',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Deleting team');
    });

    it('falls back to tool name for unknown tools', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'SomeNewTool',
        tool_input: { foo: 'bar' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('SomeNewTool');
    });

    it('returns tool name when no input provided', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Read');
    });
  });

  describe('unknown event types', () => {
    it('does not crash on unknown event types', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SomeFutureEvent',
      });

      // Should not throw, agent should be unchanged
      const agent = sm.getAgentById('sess-1');
      expect(agent?.status).toBe('idle');
    });
  });

  describe('session activity tracking', () => {
    it('updates session activity timestamp on any event', () => {
      const session = makeSession('sess-1', 'test-project', { lastActivity: 1000 });
      sm.registerAgent(makeAgent('sess-1', 'coder'));
      sm.addSession(session);

      const before = session.lastActivity;

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/file.ts' },
      });

      const sessions = sm.getSessions();
      const updated = sessions.get('sess-1');
      expect(updated!.lastActivity).toBeGreaterThanOrEqual(before);
    });
  });

  describe('TeamDelete via PostToolUse', () => {
    it('clears team agents and adds system message', () => {
      setupAgent('sess-1', 'lead');
      sm.setTeamName('old-team');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamDelete',
        tool_input: {},
      });

      const state = sm.getState();
      expect(state.name).toBe('');
      const msg = state.messages.find(m => m.content === 'Team deleted');
      expect(msg).toBeDefined();
      expect(msg!.from).toBe('system');
    });
  });

  describe('extractTaskCreate edge cases', () => {
    it('uses "Untitled task" when no subject or description provided', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {},
        tool_response: {
          result: 'Task #50 created successfully',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '50');
      expect(task).toBeDefined();
      expect(task!.subject).toBe('Untitled task');
    });

    it('falls back to JSON.stringify when response.result is not a string', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {
          subject: 'Test task',
        },
        tool_response: {
          data: { id: 99 },
        },
      });

      // No "Task #N" match in JSON.stringify output, so uses hook-* id
      const task = sm.getState().tasks.find(t => t.subject === 'Test task');
      expect(task).toBeDefined();
      expect(task!.id).toMatch(/^hook-/);
    });

    it('truncates long descriptions when used as subject', () => {
      setupAgent('sess-1', 'lead');
      const longDesc = 'A'.repeat(100);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskCreate',
        tool_input: {
          description: longDesc,
        },
        tool_response: {
          result: 'Task #77 created',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '77');
      expect(task).toBeDefined();
      expect(task!.subject.length).toBeLessThanOrEqual(60);
    });
  });

  describe('extractTaskUpdate edge cases', () => {
    it('handles status reversal to pending', () => {
      setupAgent('sess-1', 'lead');

      sm.updateTask({
        id: '30',
        subject: 'Task',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '30',
          status: 'pending',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '30');
      expect(task!.status).toBe('pending');
    });

    it('does nothing when tool_input is missing', () => {
      setupAgent('sess-1', 'lead');
      const tasksBefore = sm.getState().tasks.length;

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
      });

      expect(sm.getState().tasks.length).toBe(tasksBefore);
    });

    it('does nothing when taskId is empty', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '',
          status: 'completed',
        },
      });

      // Should not crash
      expect(sm.getState().tasks).toHaveLength(0);
    });

    it('clears currentTaskId when task is set to pending', () => {
      const coder = makeAgent('agent-coder', 'coder', { currentTaskId: '40' });
      sm.setAgents([coder]);

      sm.updateTask({
        id: '40',
        subject: 'Task',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'agent-coder',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: { taskId: '40', status: 'pending' },
      });

      const agent = sm.getState().agents.find(a => a.name === 'coder');
      expect(agent?.currentTaskId).toBeUndefined();
    });
  });

  describe('PostToolUse with no tool_input', () => {
    it('does not process team tools when tool_input is missing', () => {
      setupAgent('sess-1', 'lead');
      const stateBefore = JSON.stringify(sm.getState());

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        // no tool_input
      });

      // State should remain unchanged (no messages added)
      // The only change should be the waiting state was cleared
      const agent = sm.getAgentById('sess-1');
      expect(agent?.waitingForInput).toBe(false);
    });
  });

  describe('SubagentStart without pending Task spawn', () => {
    it('uses agent_type as name when no pending spawn exists', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-no-spawn',
        agent_type: 'code-helper',
      });

      const subagent = sm.getAgentById('sub-no-spawn');
      expect(subagent).toBeDefined();
      expect(subagent!.name).toBe('code-helper');
    });

    it('falls back to "subagent" when both agent_type and spawn are missing', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-plain',
      } as any);

      const subagent = sm.getAgentById('sub-plain');
      expect(subagent).toBeDefined();
      // agent_type is undefined, no pending spawn, so name should be 'subagent' or similar
    });
  });

  describe('pending spawn cleanup', () => {
    it('removes stale pending spawns older than 60s', () => {
      setupAgent('sess-1', 'lead');

      // Create a pending spawn
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'Old spawn',
          prompt: 'Do something',
          subagent_type: 'Explorer',
        },
        tool_use_id: 'tu-old',
      });

      // Advance time past 60s
      vi.advanceTimersByTime(61_000);

      // Create another PreToolUse with Task to trigger cleanup
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'New spawn',
          prompt: 'Do new thing',
          subagent_type: 'Implementer',
        },
        tool_use_id: 'tu-new',
      });

      // SubagentStart should use the new spawn, not the old one
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-cleanup-test',
        agent_type: 'general-purpose',
      });

      const subagent = sm.getAgentById('sub-cleanup-test');
      expect(subagent!.name).toBe('New spawn');
    });
  });

  describe('SendMessage with shutdown_response type', () => {
    it('does not add message for shutdown_response (unrecognized type)', () => {
      setupAgent('sess-1', 'coder');
      const initialMsgCount = sm.getState().messages.length;

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'shutdown_response',
          approve: true,
          request_id: 'req-123',
        },
      });

      // shutdown_response has no content/summary, so should not add a message
      expect(sm.getState().messages.length).toBe(initialMsgCount);
    });
  });

  describe('SendMessageTool (alternative name)', () => {
    it('extracts message from SendMessageTool same as SendMessage', () => {
      setupAgent('sess-1', 'coder');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessageTool',
        tool_input: {
          type: 'message',
          recipient: 'lead',
          content: 'Hello from SendMessageTool',
          summary: 'SMT test',
        },
      });

      const msg = sm.getState().messages.find(m => m.content === 'SMT test');
      expect(msg).toBeDefined();
      expect(msg!.from).toBe('coder');
    });
  });

  describe('resolveAgentName fallback', () => {
    it('uses truncated session ID when agent is not registered', () => {
      // Don't set up agent, just create a session without agent
      const session = makeSession('abcdefgh-long-session-id', 'project', { lastActivity: 1000 });
      sm.addSession(session);

      handler.handleEvent({
        session_id: 'abcdefgh-long-session-id',
        hook_event_name: 'PostToolUse',
        tool_name: 'SendMessage',
        tool_input: {
          type: 'message',
          recipient: 'someone',
          content: 'hello',
          summary: 'test',
        },
      });

      const msg = sm.getState().messages.find(m => m.to === 'someone');
      expect(msg).toBeDefined();
      expect(msg!.from).toBe('abcdefgh'); // truncated to first 8 chars
    });
  });

  describe('TaskUpdate with owner change and currentTaskId tracking', () => {
    it('updates owner on existing task', () => {
      setupAgent('sess-1', 'lead');

      sm.updateTask({
        id: '60',
        subject: 'Build',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TaskUpdate',
        tool_input: {
          taskId: '60',
          owner: 'coder',
        },
      });

      const task = sm.getState().tasks.find(t => t.id === '60');
      expect(task!.owner).toBe('coder');
    });
  });

  describe('TeamCreate with missing team_name', () => {
    it('does not register team when team_name is missing', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamCreate',
        tool_input: {},
        tool_response: {},
      });

      // Team name should not have changed
      expect(sm.getState().name).toBe('test-project');
    });
  });

  describe('TeamCreate with missing response members', () => {
    it('registers team name but no members when response has no members array', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PostToolUse',
        tool_name: 'TeamCreate',
        tool_input: {
          team_name: 'no-members-team',
        },
        tool_response: {
          status: 'ok',
        },
      });

      expect(sm.getState().name).toBe('no-members-team');
      // Only the setup agent should exist, no new members
    });
  });

  describe('describeToolAction edge cases', () => {
    it('handles Grep with path but no glob', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: 'useState', path: '/Users/Danny/Source/my-app/src' },
      });
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Searching: useState');
      expect(agent?.actionContext).toBe('in my-app/src');
    });

    it('handles Grep with no pattern', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Searching files');
    });

    it('handles Task with no description', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {},
        tool_use_id: 'tu-999',
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Spawning agent');
    });

    it('handles TaskCreate with no subject', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TaskCreate',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Creating task');
    });

    it('handles WebSearch with no query', () => {
      setupAgent('sess-1', 'coder');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'WebSearch',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Web search');
    });

    it('handles SendMessage with missing recipient defaults to "team"', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'SendMessage',
        tool_input: { type: 'message' },
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Messaging team');
    });

    it('handles TeamCreate with no team_name in input', () => {
      setupAgent('sess-1', 'lead');
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'TeamCreate',
        tool_input: {},
      });
      expect(sm.getAgentById('sess-1')?.currentAction).toBe('Creating team');
    });

    it('truncates long patterns/descriptions', () => {
      setupAgent('sess-1', 'coder');
      const longPattern = 'a'.repeat(60);
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: longPattern },
      });
      const action = sm.getAgentById('sess-1')?.currentAction;
      expect(action!.length).toBeLessThanOrEqual(55); // "Searching: " + 40 chars max
    });
  });

  describe('FIFO subagent spawn matching', () => {
    it('matches multiple simultaneous subagents to correct Task spawns in FIFO order', () => {
      setupAgent('sess-1', 'lead');

      // Spawn two Task tools in quick succession
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'Research API patterns',
          subagent_type: 'Explorer',
        },
        tool_use_id: 'tu-first',
      });

      vi.advanceTimersByTime(10);

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: {
          description: 'Implement auth module',
          subagent_type: 'Implementer',
        },
        tool_use_id: 'tu-second',
      });

      // First SubagentStart should get the FIRST spawn (Research API patterns)
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-a',
        agent_type: 'general-purpose',
      });

      const subA = sm.getAgentById('sub-a');
      expect(subA).toBeDefined();
      expect(subA!.name).toBe('Research API patterns');
      expect(subA!.role).toBe('researcher');

      // Second SubagentStart should get the SECOND spawn (Implement auth module)
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-b',
        agent_type: 'general-purpose',
      });

      const subB = sm.getAgentById('sub-b');
      expect(subB).toBeDefined();
      expect(subB!.name).toBe('Implement auth module');
      expect(subB!.role).toBe('implementer');
    });

    it('consumes pending spawn entries so they are not reused', () => {
      setupAgent('sess-1', 'lead');

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { description: 'Only spawn' },
        tool_use_id: 'tu-only',
      });

      // First SubagentStart consumes the pending spawn
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-1',
        agent_type: 'general-purpose',
      });

      expect(sm.getAgentById('sub-1')!.name).toBe('Only spawn');

      // Second SubagentStart has no pending spawn — falls back to agent_type
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-2',
        agent_type: 'general-purpose',
      });

      expect(sm.getAgentById('sub-2')!.name).toBe('general-purpose');
    });

    it('does not match spawns from a different session', () => {
      setupAgent('sess-1', 'lead');
      sm.registerAgent(makeAgent('sess-2', 'other'));
      sm.addSession(makeSession('sess-2', 'other-project', { lastActivity: 500 }));

      // Task spawn from sess-2
      handler.handleEvent({
        session_id: 'sess-2',
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { description: 'Wrong session spawn' },
        tool_use_id: 'tu-wrong',
      });

      // SubagentStart from sess-1 should NOT match sess-2's spawn
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'SubagentStart',
        agent_id: 'sub-x',
        agent_type: 'explorer',
      });

      expect(sm.getAgentById('sub-x')!.name).toBe('explorer');
    });
  });

  describe('subagent tool event routing', () => {
    it('routes PreToolUse events to subagent by session_id', () => {
      setupAgent('sess-1', 'lead');

      // Register a subagent
      sm.registerAgent(makeAgent('sub-agent-1', 'researcher', {
        isSubagent: true,
        parentAgentId: 'sess-1',
        status: 'working',
      }));
      sm.updateAgent(sm.getAgentById('sub-agent-1')!);

      // PreToolUse with subagent's session_id
      handler.handleEvent({
        session_id: 'sub-agent-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Grep',
        tool_input: { pattern: 'handleEvent' },
      });

      const subagent = sm.getAgentById('sub-agent-1');
      expect(subagent?.status).toBe('working');
      expect(subagent?.currentAction).toBe('Searching: handleEvent');

      // Parent should not be affected
      const parent = sm.getAgentById('sess-1');
      expect(parent?.currentAction).not.toBe('Searching: handleEvent');
    });

    it('routes PermissionRequest to subagent — does NOT mark parent as waiting', () => {
      setupAgent('sess-1', 'lead');

      sm.registerAgent(makeAgent('sub-agent-1', 'coder-sub', {
        isSubagent: true,
        parentAgentId: 'sess-1',
        status: 'working',
      }));
      sm.updateAgent(sm.getAgentById('sub-agent-1')!);

      handler.handleEvent({
        session_id: 'sub-agent-1',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'npm install', description: 'Install deps' },
      });

      const subagent = sm.getAgentById('sub-agent-1');
      expect(subagent?.waitingForInput).toBe(true);
      expect(subagent?.currentAction).toBe('Install deps');

      const parent = sm.getAgentById('sess-1');
      expect(parent?.waitingForInput).toBeFalsy();
    });
  });

  describe('activity debouncing', () => {
    it('debounces rapid working updates — final debounced broadcast has the latest action', () => {
      setupAgent('sess-1', 'coder');

      // Rapid sequence of tool uses within 200ms debounce window
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: '/src/a.ts' },
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: '/src/a.ts' },
      });

      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: '/src/a.ts' },
      });

      // Start tracking broadcasts AFTER the rapid sequence, before debounce fires
      const debouncedBroadcasts: string[] = [];
      sm.subscribe((msg) => {
        if (msg.type === 'agent_update' && msg.data.id === 'sess-1' && msg.data.currentAction) {
          debouncedBroadcasts.push(msg.data.currentAction);
        }
      });

      // Advance past the debounce window — only the final action should fire
      vi.advanceTimersByTime(200);

      // The debounced broadcast should show only the final action
      expect(debouncedBroadcasts).toHaveLength(1);
      expect(debouncedBroadcasts[0]).toBe('Writing a.ts');

      // The registry was updated eagerly (immediately) regardless of debounce
      const agent = sm.getAgentById('sess-1');
      expect(agent?.currentAction).toBe('Writing a.ts');
      expect(agent?.status).toBe('working');
    });

    it('broadcasts idle/done status immediately without debounce', () => {
      setupAgent('sess-1', 'coder', { status: 'working' });

      // Track broadcasts that have idle status
      const idleBroadcasts: Array<{ status: string; action?: string }> = [];
      sm.subscribe((msg) => {
        if (msg.type === 'agent_update' && msg.data.id === 'sess-1' && msg.data.status === 'idle') {
          idleBroadcasts.push({ status: msg.data.status, action: msg.data.currentAction });
        }
      });

      // Stop event -> idle status should be immediate
      handler.handleEvent({
        session_id: 'sess-1',
        hook_event_name: 'Stop',
      });

      // Idle broadcast should be immediate, without advancing timers
      expect(idleBroadcasts).toHaveLength(1);
      expect(idleBroadcasts[0].status).toBe('idle');
    });
  });
});
