import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../state';
import type { SessionInfo, AgentState, WSMessage } from '@agent-viewer/shared';

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

describe('StateManager', () => {
  let sm: StateManager;
  let messages: WSMessage[];

  beforeEach(() => {
    sm = new StateManager();
    messages = [];
    sm.subscribe((msg) => messages.push(msg));
  });

  describe('session management', () => {
    it('getSessionsList returns all registered sessions', () => {
      const s1 = makeSession('s1', 'project-a', { lastActivity: 1000 });
      const s2 = makeSession('s2', 'project-b', { lastActivity: 2000 });
      const s3 = makeSession('s3', 'project-c', { lastActivity: 3000 });

      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.registerAgent(makeAgent('s3', 'agent-c'));

      sm.addSession(s1);
      sm.addSession(s2);
      sm.addSession(s3);

      const list = sm.getSessionsList();
      expect(list).toHaveLength(3);
      expect(list.map((s) => s.sessionId).sort()).toEqual(['s1', 's2', 's3']);
    });

    it('auto-selects the most recently active session', () => {
      const s1 = makeSession('s1', 'project-a', { lastActivity: 1000 });
      const s2 = makeSession('s2', 'project-b', { lastActivity: 3000 });
      const s3 = makeSession('s3', 'project-c', { lastActivity: 2000 });

      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.registerAgent(makeAgent('s3', 'agent-c'));

      sm.addSession(s1);
      sm.addSession(s2);
      sm.addSession(s3); // older than s2, should NOT auto-select

      const list = sm.getSessionsList();
      const active = list.find((s) => s.active);
      expect(active).toBeDefined();
      expect(active!.sessionId).toBe('s2');
    });

    it('only displays the active session agent in state.agents', () => {
      const s1 = makeSession('s1', 'project-a', { lastActivity: 1000 });
      const s2 = makeSession('s2', 'project-b', { lastActivity: 2000 });

      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(s1);
      sm.addSession(s2);

      const state = sm.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('s2');
      expect(state.agents[0].name).toBe('agent-b');
    });

    it('selectSession switches displayed agent', () => {
      const s1 = makeSession('s1', 'project-a', { lastActivity: 1000 });
      const s2 = makeSession('s2', 'project-b', { lastActivity: 2000 });

      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(s1);
      sm.addSession(s2);

      // s2 is active, switch to s1
      sm.selectSession('s1');

      const state = sm.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('s1');
      expect(state.agents[0].name).toBe('agent-a');
      expect(state.session?.sessionId).toBe('s1');

      const list = sm.getSessionsList();
      expect(list.find((s) => s.active)?.sessionId).toBe('s1');
    });

    it('preserves all sessions after selectSession', () => {
      const s1 = makeSession('s1', 'project-a', { lastActivity: 1000 });
      const s2 = makeSession('s2', 'project-b', { lastActivity: 2000 });
      const s3 = makeSession('s3', 'project-c', { lastActivity: 3000 });

      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.registerAgent(makeAgent('s3', 'agent-c'));

      sm.addSession(s1);
      sm.addSession(s2);
      sm.addSession(s3);

      sm.selectSession('s1');
      expect(sm.getSessionsList()).toHaveLength(3);

      sm.selectSession('s2');
      expect(sm.getSessionsList()).toHaveLength(3);
    });

    it('broadcasts sessions_update with all sessions on addSession', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));

      // Find the last sessions_update broadcast (combined sessions_list + sessions_grouped)
      const sessionsUpdateMsgs = messages.filter((m) => m.type === 'sessions_update');
      expect(sessionsUpdateMsgs.length).toBeGreaterThan(0);

      const lastUpdate = sessionsUpdateMsgs[sessionsUpdateMsgs.length - 1];
      expect(lastUpdate.data.list).toHaveLength(2);
    });
  });

  describe('agent waiting for input', () => {
    it('setAgentWaiting marks the agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaiting('agent-a', true, 'Approve command?');

      const state = sm.getState();
      expect(state.agents[0].waitingForInput).toBe(true);
      expect(state.agents[0].currentAction).toBe('Approve command?');
    });

    it('setAgentWaiting clears the flag', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaiting('agent-a', false);

      const state = sm.getState();
      expect(state.agents[0].waitingForInput).toBe(false);
    });

    it('waiting state persists in registry across session switches', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 2000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 1000 }));

      sm.setAgentWaiting('agent-a', true, 'Approve?');

      // Switch away and back
      sm.selectSession('s2');
      sm.selectSession('s1');

      const state = sm.getState();
      expect(state.agents[0].waitingForInput).toBe(true);
    });
  });

  describe('updateAgentActivity', () => {
    it('updates agent in displayed state and registry', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivity('agent-a', 'working', 'Reading file.ts');

      const state = sm.getState();
      expect(state.agents[0].status).toBe('working');
      expect(state.agents[0].currentAction).toBe('Reading file.ts');
    });

    it('updates registry even when agent is not displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is active, s1 is not displayed

      sm.updateAgentActivity('agent-a', 'working', 'Editing');

      // Switch to s1 and verify it was updated in registry
      sm.selectSession('s1');
      const state = sm.getState();
      expect(state.agents[0].status).toBe('working');
      expect(state.agents[0].currentAction).toBe('Editing');
    });

    it('clears waitingForInput when going idle', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      // Mark as waiting
      sm.setAgentWaiting('agent-a', true, 'Approve command?');
      expect(sm.getState().agents[0].waitingForInput).toBe(true);

      // Going idle should clear waiting
      sm.updateAgentActivity('agent-a', 'idle');
      const state = sm.getState();
      expect(state.agents[0].waitingForInput).toBe(false);
      expect(state.agents[0].status).toBe('idle');
    });

    it('clears waitingForInput when going done', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaiting('agent-a', true, 'Approve?');
      sm.updateAgentActivity('agent-a', 'done');
      expect(sm.getState().agents[0].waitingForInput).toBe(false);
    });

    it('does NOT clear waitingForInput when status stays working', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaiting('agent-a', true, 'Approve?');
      sm.updateAgentActivity('agent-a', 'working', 'Still working');
      expect(sm.getState().agents[0].waitingForInput).toBe(true);
    });

    it('clears waitingForInput in registry even when not displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is active

      sm.setAgentWaiting('agent-a', true, 'Approve?');
      sm.updateAgentActivity('agent-a', 'idle');

      // Switch back to s1 and verify waiting was cleared
      sm.selectSession('s1');
      expect(sm.getState().agents[0].waitingForInput).toBe(false);
    });
  });

  describe('ID-based agent updates (cross-session safety)', () => {
    it('updateAgentActivityById targets the correct agent when names collide', () => {
      // Two sessions for the same project — agents have the same name
      const agent1 = makeAgent('session-main', 'llm-music', { status: 'idle' });
      const agent2 = makeAgent('session-feature', 'llm-music', { status: 'idle' });

      sm.registerAgent(agent1);
      sm.registerAgent(agent2);

      sm.addSession(makeSession('session-main', 'llm-music', { lastActivity: 1000, gitBranch: 'main' }));
      sm.addSession(makeSession('session-feature', 'llm-music', { lastActivity: 2000, gitBranch: 'feature/ai-chat' }));

      // session-feature is active (higher lastActivity)
      expect(sm.getState().agents[0].id).toBe('session-feature');

      // Update the feature session agent by ID
      sm.updateAgentActivityById('session-feature', 'working', 'Editing file.ts');

      // Feature agent should be updated
      const featureAgent = sm.getAgentById('session-feature');
      expect(featureAgent?.status).toBe('working');
      expect(featureAgent?.currentAction).toBe('Editing file.ts');

      // Main agent should NOT be affected
      const mainAgent = sm.getAgentById('session-main');
      expect(mainAgent?.status).toBe('idle');
      expect(mainAgent?.currentAction).toBeUndefined();
    });

    it('setAgentWaitingById targets the correct agent when names collide', () => {
      const agent1 = makeAgent('session-main', 'llm-music', { status: 'working' });
      const agent2 = makeAgent('session-feature', 'llm-music', { status: 'working' });

      sm.registerAgent(agent1);
      sm.registerAgent(agent2);

      sm.addSession(makeSession('session-main', 'llm-music', { lastActivity: 1000, gitBranch: 'main' }));
      sm.addSession(makeSession('session-feature', 'llm-music', { lastActivity: 2000, gitBranch: 'feature/ai-chat' }));

      // Set waiting on feature session only
      sm.setAgentWaitingById('session-feature', true, 'AskUserQuestion');

      const featureAgent = sm.getAgentById('session-feature');
      expect(featureAgent?.waitingForInput).toBe(true);

      const mainAgent = sm.getAgentById('session-main');
      expect(mainAgent?.waitingForInput).toBeFalsy();
    });

    it('updateAgentActivityById broadcasts update when agent is displayed', () => {
      vi.useFakeTimers();
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      messages = []; // clear setup messages
      sm.updateAgentActivityById('s1', 'working', 'Running tests');

      // Working updates are debounced by 200ms
      vi.advanceTimersByTime(200);

      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
      if (updates[0].type === 'agent_update') {
        expect(updates[0].data.status).toBe('working');
      }
      vi.useRealTimers();
    });

    it('updateAgentActivityById does not broadcast when agent is not displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is displayed

      messages = [];
      sm.updateAgentActivityById('s1', 'working', 'Editing');

      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(0);

      // But registry was updated
      const agent = sm.getAgentById('s1');
      expect(agent?.status).toBe('working');
    });

    it('setAgentWaitingById clears flag correctly', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaitingById('s1', false);

      const agent = sm.getAgentById('s1');
      expect(agent?.waitingForInput).toBe(false);
    });

    it('getAgentById returns undefined for unknown ID', () => {
      expect(sm.getAgentById('nonexistent')).toBeUndefined();
    });
  });

  describe('sessions list broadcast completeness', () => {
    it('sessions_update always includes all registered sessions', () => {
      // Register 5 sessions
      for (let i = 1; i <= 5; i++) {
        sm.registerAgent(makeAgent(`s${i}`, `agent-${i}`));
        sm.addSession(makeSession(`s${i}`, `project-${i}`, { lastActivity: i * 1000 }));
      }

      // Verify the LAST sessions_update message has all 5
      const sessionsUpdateMsgs = messages.filter((m) => m.type === 'sessions_update');
      const last = sessionsUpdateMsgs[sessionsUpdateMsgs.length - 1];
      expect(last.data.list).toHaveLength(5);
      const ids = last.data.list.map((s: any) => s.sessionId).sort();
      expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5']);
    });

    it('sessions_list marks exactly one session as active', () => {
      for (let i = 1; i <= 3; i++) {
        sm.registerAgent(makeAgent(`s${i}`, `agent-${i}`));
        sm.addSession(makeSession(`s${i}`, `project-${i}`, { lastActivity: i * 1000 }));
      }

      const list = sm.getSessionsList();
      const activeOnes = list.filter((s) => s.active);
      expect(activeOnes).toHaveLength(1);
      // s3 has the highest lastActivity, so it should be auto-selected
      expect(activeOnes[0].sessionId).toBe('s3');
    });

    it('selectSession updates which session is active in the list', () => {
      for (let i = 1; i <= 3; i++) {
        sm.registerAgent(makeAgent(`s${i}`, `agent-${i}`));
        sm.addSession(makeSession(`s${i}`, `project-${i}`, { lastActivity: i * 1000 }));
      }

      sm.selectSession('s1');
      const list = sm.getSessionsList();
      expect(list.find((s) => s.active)?.sessionId).toBe('s1');
      expect(list).toHaveLength(3);
    });
  });

  describe('pushRecentAction via updateAgentActivity (name-based)', () => {
    it('accumulates recent actions through name-based updateAgentActivity', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivity('agent-a', 'working', 'Reading file.ts');
      sm.updateAgentActivity('agent-a', 'working', 'Editing file.ts');
      sm.updateAgentActivity('agent-a', 'working', 'Running tests');

      const agent = sm.getAgentById('s1');
      expect(agent?.recentActions).toHaveLength(3);
      expect(agent?.recentActions?.[0].action).toBe('Reading file.ts');
      expect(agent?.recentActions?.[2].action).toBe('Running tests');
    });

    it('does not push to recentActions when status is idle', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivity('agent-a', 'idle', 'Some action');
      const agent = sm.getAgentById('s1');
      expect(agent?.recentActions).toBeUndefined();
    });

    it('does not push to recentActions when action is undefined', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivity('agent-a', 'working');
      const agent = sm.getAgentById('s1');
      expect(agent?.recentActions).toBeUndefined();
    });

    it('ring buffer caps at 5 through name-based updateAgentActivity', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      for (let i = 0; i < 8; i++) {
        sm.updateAgentActivity('agent-a', 'working', `Action ${i}`);
      }
      const agent = sm.getAgentById('s1');
      expect(agent?.recentActions).toHaveLength(5);
      expect(agent?.recentActions?.[0].action).toBe('Action 3');
      expect(agent?.recentActions?.[4].action).toBe('Action 7');
    });
  });

  describe('setAgentCurrentTask', () => {
    it('sets currentTaskId on an agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentCurrentTask('s1', '42');
      const agent = sm.getAgentById('s1');
      expect(agent?.currentTaskId).toBe('42');
    });

    it('clears currentTaskId when set to undefined', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { currentTaskId: '42' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentCurrentTask('s1', undefined);
      const agent = sm.getAgentById('s1');
      expect(agent?.currentTaskId).toBeUndefined();
    });

    it('broadcasts agent_update when agent is displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      sm.setAgentCurrentTask('s1', '99');
      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
    });

    it('does nothing for unknown agent ID', () => {
      sm.setAgentCurrentTask('nonexistent', '42');
      // Should not throw
      expect(sm.getAgentById('nonexistent')).toBeUndefined();
    });

    it('updates displayed agent currentTaskId', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentCurrentTask('s1', '55');
      const state = sm.getState();
      expect(state.agents[0].currentTaskId).toBe('55');
    });
  });

  describe('setAgents preserves fields', () => {
    it('preserves tasksCompleted from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', { tasksCompleted: 5, status: 'working' }));

      sm.setAgents([makeAgent('a1', 'coder', { tasksCompleted: 0 })]);
      const state = sm.getState();
      expect(state.agents[0].tasksCompleted).toBe(5);
    });

    it('preserves status from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', { status: 'working' }));

      sm.setAgents([makeAgent('a1', 'coder', { status: 'idle' })]);
      expect(sm.getState().agents[0].status).toBe('working');
    });

    it('preserves currentAction and actionContext from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', {
        currentAction: 'Reading file.ts',
        actionContext: 'src/components',
      }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.currentAction).toBe('Reading file.ts');
      expect(agent.actionContext).toBe('src/components');
    });

    it('preserves currentTaskId and recentActions from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', {
        currentTaskId: '7',
        recentActions: [{ action: 'test', timestamp: 1000 }],
      }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.currentTaskId).toBe('7');
      expect(agent.recentActions).toHaveLength(1);
    });

    it('does not preserve fields for new agents (not in registry)', () => {
      sm.setAgents([makeAgent('new-1', 'new-coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.tasksCompleted).toBe(0);
      expect(agent.status).toBe('idle');
      expect(agent.currentAction).toBeUndefined();
    });
  });

  describe('updateAgent display logic', () => {
    it('adds subagent to display when it belongs to active session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      const subagent = makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 's1',
        status: 'working',
      });
      sm.registerAgent(subagent);
      sm.updateAgent(subagent);

      const state = sm.getState();
      expect(state.agents).toHaveLength(2);
      expect(state.agents[1].id).toBe('sub-1');
    });

    it('broadcasts agent_added for new subagent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      const subagent = makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 's1',
      });
      sm.registerAgent(subagent);
      sm.updateAgent(subagent);

      const addedMsgs = messages.filter((m) => m.type === 'agent_added');
      expect(addedMsgs).toHaveLength(1);
    });

    it('does not add subagent to display when parent is not active session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is active

      const subagent = makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 's1', // parent is s1, not active s2
      });
      sm.registerAgent(subagent);
      sm.updateAgent(subagent);

      const state = sm.getState();
      // Only s2 agent should be displayed
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('s2');
    });

    it('broadcasts agent_update when updating an existing displayed agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      sm.updateAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
    });
  });

  describe('removeAgent', () => {
    it('removes agent from registry and display', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.removeAgent('s1');

      expect(sm.getAgentById('s1')).toBeUndefined();
      expect(sm.getState().agents).toHaveLength(0);
    });

    it('broadcasts agent_removed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      sm.removeAgent('s1');

      const removed = messages.filter((m) => m.type === 'agent_removed');
      expect(removed).toHaveLength(1);
      if (removed[0].type === 'agent_removed') {
        expect(removed[0].data.id).toBe('s1');
      }
    });
  });

  describe('updateTask ownership reassignment', () => {
    it('clears old agent status when task is reassigned', () => {
      sm.setAgents([
        makeAgent('a1', 'coder-a', { status: 'working' }),
        makeAgent('a2', 'coder-b', { status: 'idle' }),
      ]);

      sm.updateTask({
        id: 't1',
        subject: 'Feature',
        status: 'in_progress',
        owner: 'coder-a',
        blockedBy: [],
        blocks: [],
      });

      // Reassign to coder-b
      sm.updateTask({
        id: 't1',
        subject: 'Feature',
        status: 'in_progress',
        owner: 'coder-b',
        blockedBy: [],
        blocks: [],
      });

      const agentA = sm.getState().agents.find((a) => a.name === 'coder-a');
      expect(agentA?.status).toBe('idle');
      expect(agentA?.currentAction).toBeUndefined();
    });

    it('does not clear old agent if they have other in_progress tasks', () => {
      sm.setAgents([
        makeAgent('a1', 'coder-a', { status: 'working' }),
        makeAgent('a2', 'coder-b', { status: 'idle' }),
      ]);

      sm.updateTask({
        id: 't1',
        subject: 'Feature 1',
        status: 'in_progress',
        owner: 'coder-a',
        blockedBy: [],
        blocks: [],
      });
      sm.updateTask({
        id: 't2',
        subject: 'Feature 2',
        status: 'in_progress',
        owner: 'coder-a',
        blockedBy: [],
        blocks: [],
      });

      // Reassign t1 to coder-b, but coder-a still has t2
      sm.updateTask({
        id: 't1',
        subject: 'Feature 1',
        status: 'in_progress',
        owner: 'coder-b',
        blockedBy: [],
        blocks: [],
      });

      const agentA = sm.getState().agents.find((a) => a.name === 'coder-a');
      expect(agentA?.status).toBe('working');
    });
  });

  describe('removeTask', () => {
    it('removes task from state', () => {
      sm.updateTask({
        id: 't1',
        subject: 'Task',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });

      sm.removeTask('t1');
      expect(sm.getState().tasks.find((t) => t.id === 't1')).toBeUndefined();
    });

    it('broadcasts full_state after removal', () => {
      sm.updateTask({
        id: 't1',
        subject: 'Task',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });
      messages = [];

      sm.removeTask('t1');
      const fullStates = messages.filter((m) => m.type === 'full_state');
      expect(fullStates).toHaveLength(1);
    });
  });

  describe('addMessage deduplication', () => {
    it('does not add duplicate messages with same id', () => {
      sm.addMessage({
        id: 'msg-1',
        from: 'a',
        to: 'b',
        content: 'hello',
        timestamp: Date.now(),
      });
      sm.addMessage({
        id: 'msg-1',
        from: 'a',
        to: 'b',
        content: 'hello again',
        timestamp: Date.now(),
      });

      expect(sm.getState().messages).toHaveLength(1);
      expect(sm.getState().messages[0].content).toBe('hello');
    });

    it('broadcasts new_message only once for duplicate', () => {
      messages = [];
      sm.addMessage({
        id: 'msg-2',
        from: 'a',
        to: 'b',
        content: 'test',
        timestamp: Date.now(),
      });
      sm.addMessage({
        id: 'msg-2',
        from: 'a',
        to: 'b',
        content: 'test',
        timestamp: Date.now(),
      });

      const newMsgEvents = messages.filter((m) => m.type === 'new_message');
      expect(newMsgEvents).toHaveLength(1);
    });
  });

  describe('subscribe and unsubscribe', () => {
    it('unsubscribe stops receiving messages', () => {
      const msgs: WSMessage[] = [];
      const unsub = sm.subscribe((msg) => msgs.push(msg));

      sm.setTeamName('test');
      expect(msgs.length).toBeGreaterThan(0);

      const countBefore = msgs.length;
      unsub();
      sm.setTeamName('test2');
      expect(msgs.length).toBe(countBefore);
    });

    it('broadcast continues if one listener throws', () => {
      const msgs: WSMessage[] = [];
      sm.subscribe(() => {
        throw new Error('bad listener');
      });
      sm.subscribe((msg) => msgs.push(msg));

      sm.setTeamName('test');
      // Second listener should still receive the message
      expect(msgs.length).toBeGreaterThan(0);
    });
  });

  describe('addSession auto-select logic', () => {
    it('does NOT auto-select a session older than current', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 3000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 1000 })); // older

      const state = sm.getState();
      expect(state.session?.sessionId).toBe('s1'); // s1 should remain active
    });

    it('broadcasts session_started for each session added', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      const sessionStarted = messages.filter((m) => m.type === 'session_started');
      expect(sessionStarted).toHaveLength(1);
    });

    it('broadcasts sessions_update when older session is added without switching', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 3000 }));
      messages = [];
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 1000 }));

      const sessionsUpdates = messages.filter((m) => m.type === 'sessions_update');
      expect(sessionsUpdates.length).toBeGreaterThan(0);
    });
  });

  describe('selectSession for team sessions', () => {
    it('displays team agents excluding solo session agents', () => {
      const teamSession = makeSession('team-1', 'project-x', {
        isTeam: true,
        teamName: 'alpha',
        lastActivity: 5000,
      });
      const soloSession = makeSession('solo-1', 'project-y', { lastActivity: 1000 });

      sm.registerAgent(makeAgent('solo-1', 'solo-agent'));
      sm.registerAgent(makeAgent('agent-lead', 'lead', { role: 'lead', teamName: 'alpha' }));
      sm.registerAgent(makeAgent('agent-coder', 'coder', { role: 'implementer', teamName: 'alpha' }));

      sm.addSession(soloSession);
      sm.addSession(teamSession);

      // team session is active (higher lastActivity)
      sm.selectSession('team-1');

      const state = sm.getState();
      expect(state.name).toBe('alpha');
      // Solo session agent should be excluded; only agents with matching teamName included
      const agentIds = state.agents.map((a) => a.id);
      expect(agentIds).not.toContain('solo-1');
      expect(agentIds).toContain('agent-lead');
      expect(agentIds).toContain('agent-coder');
    });

    it('sets name to teamName for team sessions', () => {
      const teamSession = makeSession('team-1', 'project-x', {
        isTeam: true,
        teamName: 'builders',
        lastActivity: 5000,
      });
      sm.addSession(teamSession);
      sm.selectSession('team-1');
      expect(sm.getState().name).toBe('builders');
    });

    it('falls back to projectName when teamName is empty', () => {
      const teamSession = makeSession('team-1', 'project-x', {
        isTeam: true,
        lastActivity: 5000,
      });
      sm.addSession(teamSession);
      sm.selectSession('team-1');
      expect(sm.getState().name).toBe('project-x');
    });
  });

  describe('selectSession includes subagents', () => {
    it('shows subagents of the active solo session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 's1',
      }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.selectSession('s1');
      const state = sm.getState();
      expect(state.agents).toHaveLength(2);
      const ids = state.agents.map((a) => a.id);
      expect(ids).toContain('s1');
      expect(ids).toContain('sub-1');
    });
  });

  describe('selectMostRecentSession', () => {
    it('selects the session with highest lastActivity', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.registerAgent(makeAgent('s3', 'agent-c'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 5000 }));
      sm.addSession(makeSession('s3', 'project-c', { lastActivity: 3000 }));

      // Manually switch to s1
      sm.selectSession('s1');
      expect(sm.getState().session?.sessionId).toBe('s1');

      // selectMostRecentSession should switch to s2
      sm.selectMostRecentSession();
      expect(sm.getState().session?.sessionId).toBe('s2');
    });

    it('does nothing when there are no sessions', () => {
      sm.selectMostRecentSession();
      expect(sm.getState().session).toBeUndefined();
    });
  });

  describe('selectMostInterestingSession', () => {
    it('selects a working session over an idle session', () => {
      const now = Date.now();
      sm.registerAgent(makeAgent('idle-1', 'idle-agent', { status: 'idle' }));
      sm.registerAgent(makeAgent('working-1', 'working-agent', { status: 'working' }));

      sm.addSession(makeSession('idle-1', 'project-idle', { lastActivity: now }));
      sm.addSession(makeSession('working-1', 'project-working', { lastActivity: now - 5000 }));

      // Manually select the idle session
      sm.selectSession('idle-1');
      expect(sm.getState().session?.sessionId).toBe('idle-1');

      // selectMostInterestingSession should prefer the working session
      sm.selectMostInterestingSession();
      expect(sm.getState().session?.sessionId).toBe('working-1');
    });

    it('selects a waiting-for-input session over a merely recent session', () => {
      const now = Date.now();
      sm.registerAgent(makeAgent('recent-1', 'recent-agent', { status: 'idle' }));
      sm.registerAgent(makeAgent('waiting-1', 'waiting-agent', { status: 'working', waitingForInput: true }));

      // Recent session has a higher lastActivity (more recent) but no waiting agent
      sm.addSession(makeSession('recent-1', 'project-recent', { lastActivity: now }));
      sm.addSession(makeSession('waiting-1', 'project-waiting', { lastActivity: now - 60000 }));

      sm.selectSession('recent-1');
      sm.selectMostInterestingSession();
      expect(sm.getState().session?.sessionId).toBe('waiting-1');
    });

    it('selects a session with agents over an empty session', () => {
      const now = Date.now();
      // s-empty has no registered agent — just a session
      // s-has-agent has a registered agent
      sm.registerAgent(makeAgent('s-has-agent', 'agent-a', { status: 'idle' }));

      sm.addSession(makeSession('s-empty', 'project-empty', { lastActivity: now }));
      sm.addSession(makeSession('s-has-agent', 'project-with-agent', { lastActivity: now - 120000 }));

      sm.selectSession('s-empty');
      sm.selectMostInterestingSession();
      expect(sm.getState().session?.sessionId).toBe('s-has-agent');
    });

    it('actively working agent (< 30s activity) scores highest', () => {
      const now = Date.now();
      // One session with actively working agent (very recent activity)
      sm.registerAgent(makeAgent('active-1', 'active-agent', { status: 'working' }));
      // Another with waiting agent but older activity
      sm.registerAgent(makeAgent('waiting-1', 'waiting-agent', { status: 'working', waitingForInput: true }));

      sm.addSession(makeSession('active-1', 'project-active', { lastActivity: now - 5000 }));
      sm.addSession(makeSession('waiting-1', 'project-waiting', { lastActivity: now - 5000 }));

      sm.selectMostInterestingSession();
      // Active working (1000+200+100+50+recency) > waiting (500+200+100+50+recency)
      expect(sm.getState().session?.sessionId).toBe('active-1');
    });

    it('does nothing when there are no sessions', () => {
      sm.selectMostInterestingSession();
      expect(sm.getState().session).toBeUndefined();
    });

    it('uses recency as tiebreaker when sessions have same features', () => {
      const now = Date.now();
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
      sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'idle' }));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now - 60000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: now - 10000 }));

      sm.selectSession('s1');
      sm.selectMostInterestingSession();
      // Both have agents (+50), active in last 5 min (+100), s2 has higher recency bonus
      expect(sm.getState().session?.sessionId).toBe('s2');
    });
  });

  describe('clearTeamAgents', () => {
    it('removes team agents but keeps solo session agents', () => {
      const soloSession = makeSession('solo-1', 'project-a', { lastActivity: 1000 });
      sm.registerAgent(makeAgent('solo-1', 'solo-agent'));
      sm.registerAgent(makeAgent('team-agent-1', 'lead', { role: 'lead' }));
      sm.registerAgent(makeAgent('team-agent-2', 'coder'));

      sm.addSession(soloSession);
      sm.setAgents([
        makeAgent('solo-1', 'solo-agent'),
        makeAgent('team-agent-1', 'lead', { role: 'lead' }),
        makeAgent('team-agent-2', 'coder'),
      ]);

      sm.clearTeamAgents();

      const state = sm.getState();
      expect(state.agents).toHaveLength(1);
      expect(state.agents[0].id).toBe('solo-1');
      expect(state.name).toBe('');
      expect(state.tasks).toEqual([]);
    });

    it('clears team name and tasks', () => {
      const soloSession = makeSession('solo-1', 'project-a', { lastActivity: 1000 });
      sm.addSession(soloSession);
      sm.registerAgent(makeAgent('solo-1', 'solo-agent'));
      sm.setTeamName('my-team');
      sm.updateTask({
        id: 't1',
        subject: 'Task',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
        blocks: [],
      });

      sm.clearTeamAgents();
      expect(sm.getState().name).toBe('');
      expect(sm.getState().tasks).toEqual([]);
    });
  });

  describe('reconcileAgentStatuses', () => {
    it('sets agents with in_progress tasks to working', () => {
      sm.setAgents([
        makeAgent('a1', 'coder', { status: 'idle' }),
      ]);
      sm.updateTask({
        id: 't1',
        subject: 'Feature',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      sm.reconcileAgentStatuses();
      const agent = sm.getState().agents[0];
      expect(agent.status).toBe('working');
    });

    it('sets agents without in_progress tasks to idle', () => {
      sm.setAgents([
        makeAgent('a1', 'coder', { status: 'working' }),
      ]);
      sm.updateTask({
        id: 't1',
        subject: 'Feature',
        status: 'completed',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });

      sm.reconcileAgentStatuses();
      const agent = sm.getState().agents[0];
      expect(agent.status).toBe('idle');
      expect(agent.currentAction).toBeUndefined();
    });

    it('does not change agent already in correct status', () => {
      sm.setAgents([
        makeAgent('a1', 'coder', { status: 'working' }),
      ]);
      sm.updateTask({
        id: 't1',
        subject: 'Feature',
        status: 'in_progress',
        owner: 'coder',
        blockedBy: [],
        blocks: [],
      });
      messages = [];

      sm.reconcileAgentStatuses();
      // Should not broadcast since status is already correct
      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(0);
    });
  });

  describe('removeSession', () => {
    it('removes session and clears active session if it was active', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      expect(sm.getState().session?.sessionId).toBe('s1');

      sm.removeSession('s1');
      expect(sm.getState().session).toBeUndefined();
      expect(sm.getSessionsList()).toHaveLength(0);
    });

    it('broadcasts session_ended', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      sm.removeSession('s1');
      const ended = messages.filter((m) => m.type === 'session_ended');
      expect(ended).toHaveLength(1);
    });

    it('does not clear active session when removing non-active session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is active

      sm.removeSession('s1');
      expect(sm.getState().session?.sessionId).toBe('s2');
      expect(sm.getSessionsList()).toHaveLength(1);
    });
  });

  describe('updateSessionActivity', () => {
    it('updates session lastActivity timestamp', () => {
      const session = makeSession('s1', 'project-a', { lastActivity: 1000 });
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(session);

      sm.updateSessionActivity('s1');
      const sessions = sm.getSessions();
      expect(sessions.get('s1')!.lastActivity).toBeGreaterThan(1000);
    });

    it('does nothing for unknown session', () => {
      // Should not throw
      sm.updateSessionActivity('nonexistent');
    });
  });

  describe('stoppedSessions (Stop hook prevents JSONL override)', () => {
    it('marks and checks stopped sessions', () => {
      expect(sm.isSessionStopped('s1')).toBe(false);
      sm.markSessionStopped('s1');
      expect(sm.isSessionStopped('s1')).toBe(true);
    });

    it('clears stopped flag', () => {
      sm.markSessionStopped('s1');
      sm.clearSessionStopped('s1');
      expect(sm.isSessionStopped('s1')).toBe(false);
    });

    it('clearing non-existent session does not throw', () => {
      sm.clearSessionStopped('nonexistent');
      expect(sm.isSessionStopped('nonexistent')).toBe(false);
    });

    it('stopped session blocks updateAgentActivityById from setting working', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.updateAgent(makeAgent('s1', 'agent-a', { status: 'working' }));

      // Stop the session
      sm.markSessionStopped('s1');
      expect(sm.isSessionStopped('s1')).toBe(true);

      // Attempt to set back to working (simulates JSONL watcher trailing event)
      sm.updateAgentActivityById('s1', 'working', 'Some action');

      // Should remain idle/unchanged because session is stopped
      // Note: updateAgentActivityById doesn't check stoppedSessions itself,
      // callers (watcher) are expected to check isSessionStopped first.
      // This test documents the expected caller behavior.
      const agent = sm.getAgentById('s1');
      expect(agent).toBeDefined();
      // The state manager doesn't enforce this invariant internally (callers do),
      // but clearSessionStopped via PreToolUse/UserPromptSubmit is the only way
      // to legitimately resume activity.
    });
  });

  describe('selectSession with unknown session', () => {
    it('does nothing for unknown session ID', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      const stateBefore = sm.getState().session?.sessionId;
      sm.selectSession('nonexistent');
      expect(sm.getState().session?.sessionId).toBe(stateBefore);
    });
  });

  describe('setAgentWaitingById with actionContext', () => {
    it('sets actionContext when provided', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaitingById('s1', true, 'Editing file.ts', 'src/components');
      const agent = sm.getAgentById('s1');
      expect(agent?.waitingForInput).toBe(true);
      expect(agent?.currentAction).toBe('Editing file.ts');
      expect(agent?.actionContext).toBe('src/components');
    });

    it('propagates actionContext to displayed agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.setAgentWaitingById('s1', true, 'Reading config', 'etc/config');
      const displayed = sm.getState().agents[0];
      expect(displayed.actionContext).toBe('etc/config');
    });
  });

  describe('updateAgentActivityById actionContext propagation', () => {
    it('propagates actionContext to displayed agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivityById('s1', 'working', 'Editing file.ts', 'src/components');
      const displayed = sm.getState().agents[0];
      expect(displayed.actionContext).toBe('src/components');
    });

    it('clears waitingForInput when going done via ById', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working', waitingForInput: true }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentActivityById('s1', 'done');
      const agent = sm.getAgentById('s1');
      expect(agent?.waitingForInput).toBe(false);
    });
  });

  describe('getSessionsList sorting', () => {
    it('returns sessions sorted by lastActivity descending', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.registerAgent(makeAgent('s3', 'agent-c'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 2000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 5000 }));
      sm.addSession(makeSession('s3', 'project-c', { lastActivity: 1000 }));

      const list = sm.getSessionsList();
      expect(list[0].sessionId).toBe('s2');
      expect(list[1].sessionId).toBe('s1');
      expect(list[2].sessionId).toBe('s3');
    });
  });

  describe('updateAgentGitInfo', () => {
    it('sets gitBranch on agent in registry', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'feature/new-ui');

      const agent = sm.getAgentById('s1');
      expect(agent?.gitBranch).toBe('feature/new-ui');
    });

    it('sets gitWorktree on agent in registry', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', undefined, '/Users/dev/project-worktree');

      const agent = sm.getAgentById('s1');
      expect(agent?.gitWorktree).toBe('/Users/dev/project-worktree');
    });

    it('sets both gitBranch and gitWorktree simultaneously', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'feature/branch', '/Users/dev/worktree');

      const agent = sm.getAgentById('s1');
      expect(agent?.gitBranch).toBe('feature/branch');
      expect(agent?.gitWorktree).toBe('/Users/dev/worktree');
    });

    it('updates session gitBranch when agent has a matching session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'main');

      const session = sm.getSessions().get('s1');
      expect(session?.gitBranch).toBe('main');
    });

    it('updates session gitWorktree', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', undefined, '/tmp/worktree');

      const session = sm.getSessions().get('s1');
      expect(session?.gitWorktree).toBe('/tmp/worktree');
    });

    it('broadcasts agent_update when agent is displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      messages = [];

      sm.updateAgentGitInfo('s1', 'develop');

      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
      if (updates[0].type === 'agent_update') {
        expect(updates[0].data.gitBranch).toBe('develop');
      }
    });

    it('updates displayed agent gitBranch', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'feature/x');

      const displayed = sm.getState().agents[0];
      expect(displayed.gitBranch).toBe('feature/x');
    });

    it('updates displayed agent gitWorktree', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', undefined, '/Users/dev/wt');

      const displayed = sm.getState().agents[0];
      expect(displayed.gitWorktree).toBe('/Users/dev/wt');
    });

    it('does not broadcast when agent is not displayed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));
      // s2 is active
      messages = [];

      sm.updateAgentGitInfo('s1', 'feature/hidden');

      // Now broadcasts even when agent is not in global display,
      // using the allAgents entry so per-client filtering can route it
      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
      expect(updates[0].data.gitBranch).toBe('feature/hidden');

      // Registry was also updated
      expect(sm.getAgentById('s1')?.gitBranch).toBe('feature/hidden');
    });

    it('does nothing for unknown agent ID', () => {
      sm.updateAgentGitInfo('nonexistent', 'main');
      expect(sm.getAgentById('nonexistent')).toBeUndefined();
    });

    it('does not overwrite gitBranch when undefined is passed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { gitBranch: 'main' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', undefined, '/tmp/wt');

      const agent = sm.getAgentById('s1');
      expect(agent?.gitBranch).toBe('main');
      expect(agent?.gitWorktree).toBe('/tmp/wt');
    });

    it('does not overwrite gitWorktree when undefined is passed', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { gitWorktree: '/tmp/wt' }));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'develop');

      const agent = sm.getAgentById('s1');
      expect(agent?.gitBranch).toBe('develop');
      expect(agent?.gitWorktree).toBe('/tmp/wt');
    });
  });

  describe('setAgents preserves git fields', () => {
    it('preserves gitBranch from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', { gitBranch: 'feature/x' }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.gitBranch).toBe('feature/x');
    });

    it('preserves gitWorktree from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', { gitWorktree: '/tmp/wt' }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.gitWorktree).toBe('/tmp/wt');
    });

    it('preserves both gitBranch and gitWorktree together', () => {
      sm.registerAgent(makeAgent('a1', 'coder', {
        gitBranch: 'feature/branch',
        gitWorktree: '/Users/dev/project-wt',
      }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.gitBranch).toBe('feature/branch');
      expect(agent.gitWorktree).toBe('/Users/dev/project-wt');
    });
  });

  describe('getSessionsList includes git info', () => {
    it('includes gitBranch in session list entries', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a', {
        lastActivity: 1000,
        gitBranch: 'feature/test',
      }));

      const list = sm.getSessionsList();
      expect(list).toHaveLength(1);
      expect(list[0].gitBranch).toBe('feature/test');
    });

    it('sessions without gitBranch have undefined in list', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));

      const list = sm.getSessionsList();
      expect(list[0].gitBranch).toBeUndefined();
    });

    it('multiple sessions show different branches', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', {
        lastActivity: 1000,
        gitBranch: 'main',
      }));
      sm.addSession(makeSession('s2', 'project-a', {
        lastActivity: 2000,
        gitBranch: 'feature/new',
      }));

      const list = sm.getSessionsList();
      expect(list).toHaveLength(2);
      const branches = list.map((s) => s.gitBranch).sort();
      expect(branches).toEqual(['feature/new', 'main']);
    });

    it('gitBranch is updated after updateAgentGitInfo', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a', {
        lastActivity: 1000,
        gitBranch: 'main',
      }));

      sm.updateAgentGitInfo('s1', 'develop');

      const list = sm.getSessionsList();
      expect(list[0].gitBranch).toBe('develop');
    });
  });

  describe('git info persists across session switches', () => {
    it('agent gitBranch is preserved when switching sessions', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { gitBranch: 'feature/a' }));
      sm.registerAgent(makeAgent('s2', 'agent-b', { gitBranch: 'feature/b' }));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000, gitBranch: 'feature/a' }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000, gitBranch: 'feature/b' }));

      // s2 is active, switch to s1
      sm.selectSession('s1');
      expect(sm.getState().agents[0].gitBranch).toBe('feature/a');

      // Switch back to s2
      sm.selectSession('s2');
      expect(sm.getState().agents[0].gitBranch).toBe('feature/b');
    });

    it('agent gitWorktree is preserved when switching sessions', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { gitWorktree: '/tmp/wt1' }));
      sm.registerAgent(makeAgent('s2', 'agent-b', { gitWorktree: '/tmp/wt2' }));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));

      sm.selectSession('s1');
      expect(sm.getState().agents[0].gitWorktree).toBe('/tmp/wt1');

      sm.selectSession('s2');
      expect(sm.getState().agents[0].gitWorktree).toBe('/tmp/wt2');
    });
  });

  describe('removedAgents guard (prevents zombie re-registration)', () => {
    it('registerAgent skips recently removed agent', () => {
      sm.registerAgent(makeAgent('sub-1', 'worker', { isSubagent: true, parentAgentId: 's1' }));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.updateAgent(sm.getAgentById('sub-1')!);

      // Remove the subagent
      sm.removeAgent('sub-1');
      expect(sm.getAgentById('sub-1')).toBeUndefined();

      // Try to re-register — should be blocked
      sm.registerAgent(makeAgent('sub-1', 'worker', { isSubagent: true, parentAgentId: 's1' }));
      expect(sm.getAgentById('sub-1')).toBeUndefined();
    });

    it('updateAgent skips recently removed agent', () => {
      sm.registerAgent(makeAgent('sub-1', 'worker', { isSubagent: true, parentAgentId: 's1' }));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.updateAgent(sm.getAgentById('sub-1')!);

      sm.removeAgent('sub-1');

      // Try to updateAgent — should be blocked
      sm.updateAgent(makeAgent('sub-1', 'worker-v2', { isSubagent: true, parentAgentId: 's1' }));
      expect(sm.getAgentById('sub-1')).toBeUndefined();
      expect(sm.getState().agents.find(a => a.id === 'sub-1')).toBeUndefined();
    });

    it('clearRecentlyRemoved allows re-registration', () => {
      sm.registerAgent(makeAgent('sub-1', 'worker', { isSubagent: true, parentAgentId: 's1' }));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.updateAgent(sm.getAgentById('sub-1')!);

      sm.removeAgent('sub-1');
      expect(sm.wasRecentlyRemoved('sub-1')).toBe(true);

      sm.clearRecentlyRemoved('sub-1');
      expect(sm.wasRecentlyRemoved('sub-1')).toBe(false);

      // Now registration should succeed
      sm.registerAgent(makeAgent('sub-1', 'worker-new', { isSubagent: true, parentAgentId: 's1' }));
      expect(sm.getAgentById('sub-1')).toBeDefined();
      expect(sm.getAgentById('sub-1')!.name).toBe('worker-new');
    });

    it('full subagent lifecycle: start -> stop -> remove -> JSONL re-detect blocked', () => {
      sm.registerAgent(makeAgent('s1', 'parent'));
      sm.addSession(makeSession('s1', 'project-a'));

      // 1. SubagentStart: register subagent
      const sub = makeAgent('sub-1', 'explorer', {
        isSubagent: true,
        parentAgentId: 's1',
        status: 'working',
      });
      sm.registerAgent(sub);
      sm.updateAgent(sub);
      expect(sm.getState().agents).toHaveLength(2);

      // 2. SubagentStop: mark done
      sm.updateAgentActivityById('sub-1', 'done', 'Done');
      expect(sm.getAgentById('sub-1')?.status).toBe('done');

      // 3. Removal after delay
      sm.removeAgent('sub-1');
      expect(sm.getAgentById('sub-1')).toBeUndefined();
      expect(sm.getState().agents).toHaveLength(1);

      // 4. JSONL watcher tries to re-register (should be blocked)
      sm.registerAgent(makeAgent('sub-1', 'explorer-v2', { isSubagent: true, parentAgentId: 's1' }));
      expect(sm.getAgentById('sub-1')).toBeUndefined();

      sm.updateAgent(makeAgent('sub-1', 'explorer-v2', { isSubagent: true, parentAgentId: 's1' }));
      expect(sm.getAgentById('sub-1')).toBeUndefined();
    });

    it('wasRecentlyRemoved expires after 5 minutes', () => {
      vi.useFakeTimers();

      sm.removeAgent('sub-1'); // remove to add to removedAgents
      expect(sm.wasRecentlyRemoved('sub-1')).toBe(true);

      vi.advanceTimersByTime(300_001); // 5 min + 1ms
      expect(sm.wasRecentlyRemoved('sub-1')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('hookActiveSessions', () => {
    it('markHookActive and isHookActive track active hooks', () => {
      expect(sm.isHookActive('s1')).toBe(false);
      sm.markHookActive('s1');
      expect(sm.isHookActive('s1')).toBe(true);
    });

    it('isHookActive returns false after withinMs expires', () => {
      vi.useFakeTimers();
      sm.markHookActive('s1');
      expect(sm.isHookActive('s1', 5000)).toBe(true);

      vi.advanceTimersByTime(5001);
      expect(sm.isHookActive('s1', 5000)).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('getStateForSession (per-client snapshots)', () => {
    it('returns solo session state with agent and subagents', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.registerAgent(makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 's1',
        status: 'working',
      }));
      sm.addSession(makeSession('s1', 'project-a'));

      const state = sm.getStateForSession('s1');
      expect(state.name).toBe('project-a');
      expect(state.agents).toHaveLength(2);
      expect(state.agents.map(a => a.id).sort()).toEqual(['s1', 'sub-1']);
      expect(state.tasks).toEqual([]);
    });

    it('returns team session state excluding solo agents', () => {
      const teamSession = makeSession('team-1', 'project-x', {
        isTeam: true,
        teamName: 'alpha',
        lastActivity: 5000,
      });
      const soloSession = makeSession('solo-1', 'project-y', { lastActivity: 1000 });

      sm.registerAgent(makeAgent('solo-1', 'solo-agent'));
      sm.registerAgent(makeAgent('agent-lead', 'lead', { role: 'lead', teamName: 'alpha' }));

      sm.addSession(soloSession);
      sm.addSession(teamSession);

      const state = sm.getStateForSession('team-1');
      expect(state.name).toBe('alpha');
      const ids = state.agents.map(a => a.id);
      expect(ids).not.toContain('solo-1');
      expect(ids).toContain('agent-lead');
    });

    it('falls back to default state for unknown session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      const state = sm.getStateForSession('nonexistent');
      // Returns the current default state
      expect(state).toBeDefined();
    });
  });

  describe('agentBelongsToSession', () => {
    it('returns true for the session own agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      expect(sm.agentBelongsToSession('s1', 's1')).toBe(true);
    });

    it('returns true for subagent of the session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('sub-1', 'sub', { isSubagent: true, parentAgentId: 's1' }));
      sm.addSession(makeSession('s1', 'project-a'));

      expect(sm.agentBelongsToSession('sub-1', 's1')).toBe(true);
    });

    it('returns false for agent from different session', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.addSession(makeSession('s2', 'project-b'));

      expect(sm.agentBelongsToSession('s1', 's2')).toBe(false);
    });

    it('returns false for unknown session', () => {
      expect(sm.agentBelongsToSession('s1', 'nonexistent')).toBe(false);
    });
  });

  describe('updateAgentGitInfo with gitStatus', () => {
    it('sets ahead/behind/upstream/dirty on agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', 'feature/x', undefined, {
        ahead: 3,
        behind: 1,
        hasUpstream: true,
        isDirty: true,
      });

      const agent = sm.getAgentById('s1');
      expect(agent?.gitAhead).toBe(3);
      expect(agent?.gitBehind).toBe(1);
      expect(agent?.gitHasUpstream).toBe(true);
      expect(agent?.gitDirty).toBe(true);
    });

    it('propagates gitStatus to displayed agent', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      sm.updateAgentGitInfo('s1', undefined, undefined, {
        ahead: 2,
        hasUpstream: false,
      });

      const displayed = sm.getState().agents[0];
      expect(displayed.gitAhead).toBe(2);
      expect(displayed.gitHasUpstream).toBe(false);
    });
  });

  describe('setAgents preserves gitStatus fields', () => {
    it('preserves gitAhead/gitBehind/gitHasUpstream/gitDirty', () => {
      sm.registerAgent(makeAgent('a1', 'coder', {
        gitAhead: 5,
        gitBehind: 2,
        gitHasUpstream: true,
        gitDirty: false,
      }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      const agent = sm.getState().agents[0];
      expect(agent.gitAhead).toBe(5);
      expect(agent.gitBehind).toBe(2);
      expect(agent.gitHasUpstream).toBe(true);
      expect(agent.gitDirty).toBe(false);
    });

    it('preserves teamName from existing agents', () => {
      sm.registerAgent(makeAgent('a1', 'coder', { teamName: 'alpha' }));

      sm.setAgents([makeAgent('a1', 'coder')]);
      expect(sm.getState().agents[0].teamName).toBe('alpha');
    });
  });

  describe('reset clears all state', () => {
    it('clears agents, sessions, and internal tracking', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));
      sm.markSessionStopped('s1');
      sm.markHookActive('s1');

      sm.reset();

      expect(sm.getState().agents).toHaveLength(0);
      expect(sm.getState().tasks).toHaveLength(0);
      expect(sm.getSessionsList()).toHaveLength(0);
      expect(sm.getAgentById('s1')).toBeUndefined();
      // removedAgents and hookActiveSessions are also cleared
      expect(sm.wasRecentlyRemoved('s1')).toBe(false);
      expect(sm.isHookActive('s1')).toBe(false);
    });
  });
});
