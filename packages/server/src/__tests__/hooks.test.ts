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
});
