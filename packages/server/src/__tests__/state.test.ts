import { describe, it, expect, beforeEach } from 'vitest';
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

    it('broadcasts sessions_list with all sessions on addSession', () => {
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.registerAgent(makeAgent('s2', 'agent-b'));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: 1000 }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: 2000 }));

      // Find the last sessions_list broadcast
      const sessionsListMsgs = messages.filter((m) => m.type === 'sessions_list');
      expect(sessionsListMsgs.length).toBeGreaterThan(0);

      const lastList = sessionsListMsgs[sessionsListMsgs.length - 1];
      expect(lastList.type).toBe('sessions_list');
      if (lastList.type === 'sessions_list') {
        expect(lastList.data).toHaveLength(2);
      }
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
      sm.registerAgent(makeAgent('s1', 'agent-a'));
      sm.addSession(makeSession('s1', 'project-a'));

      messages = []; // clear setup messages
      sm.updateAgentActivityById('s1', 'working', 'Running tests');

      const updates = messages.filter((m) => m.type === 'agent_update');
      expect(updates).toHaveLength(1);
      if (updates[0].type === 'agent_update') {
        expect(updates[0].data.status).toBe('working');
      }
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
    it('sessions_list always includes all registered sessions', () => {
      // Register 5 sessions
      for (let i = 1; i <= 5; i++) {
        sm.registerAgent(makeAgent(`s${i}`, `agent-${i}`));
        sm.addSession(makeSession(`s${i}`, `project-${i}`, { lastActivity: i * 1000 }));
      }

      // Verify the LAST sessions_list message has all 5
      const sessionsListMsgs = messages.filter((m) => m.type === 'sessions_list');
      const last = sessionsListMsgs[sessionsListMsgs.length - 1];
      expect(last.type).toBe('sessions_list');
      if (last.type === 'sessions_list') {
        expect(last.data).toHaveLength(5);
        const ids = last.data.map((s) => s.sessionId).sort();
        expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5']);
      }
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
});
