import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateManager } from '../state';
import { startStalenessChecker } from '../watcher/stalenessChecker';
import { SESSION_EXPIRY_S, IDLE_THRESHOLD_S, STALENESS_CHECK_INTERVAL_MS } from '../watcher/types';
import type { WatcherContext, TrackedSession } from '../watcher/types';
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

function makeTrackedSession(sessionId: string, overrides?: Partial<TrackedSession>): TrackedSession {
  return {
    sessionId,
    filePath: `/home/user/.claude/projects/test/${sessionId}.jsonl`,
    isSolo: true,
    dirSlug: 'test',
    lastActivity: Date.now(),
    ...overrides,
  };
}

function makeContext(stateManager: StateManager): WatcherContext {
  return {
    stateManager,
    fileOffsets: new Map(),
    debouncer: { debounce: vi.fn(), clear: vi.fn() },
    transcriptDebouncer: { debounce: vi.fn(), clear: vi.fn() },
    registeredSessions: new Set(),
    registeredSubagents: new Set(),
    trackedSessions: new Map(),
  };
}

describe('stalenessChecker', () => {
  let sm: StateManager;
  let ctx: WatcherContext;

  beforeEach(() => {
    vi.useFakeTimers();
    sm = new StateManager();
    ctx = makeContext(sm);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('session expiry', () => {
    it('does NOT remove a session idle less than SESSION_EXPIRY_S', () => {
      const now = Date.now();
      // Session idle for 30 minutes (well under 1 hour)
      const idleMs = 1800_000; // 30 min

      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now - idleMs }));

      const tracked = makeTrackedSession('s1', {
        lastActivity: now - idleMs,
        isSolo: true,
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);
      ctx.registeredSessions.add('s1');

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      // Session should still exist
      expect(sm.getSessions().has('s1')).toBe(true);
      expect(sm.getAgentById('s1')).toBeDefined();
      expect(ctx.trackedSessions.has(tracked.filePath)).toBe(true);
    });

    it('removes a session idle for >= SESSION_EXPIRY_S', () => {
      const now = Date.now();
      const idleMs = SESSION_EXPIRY_S * 1000 + 1000; // 1 hour + 1s

      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now - idleMs }));

      const tracked = makeTrackedSession('s1', {
        lastActivity: now - idleMs,
        isSolo: true,
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);
      ctx.registeredSessions.add('s1');

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      // Session should be removed
      expect(sm.getSessions().has('s1')).toBe(false);
      expect(sm.getAgentById('s1')).toBeUndefined();
      expect(ctx.trackedSessions.has(tracked.filePath)).toBe(false);
      expect(ctx.registeredSessions.has('s1')).toBe(false);
    });

    it('does NOT expire subagent sessions (only removes after 5 min separately)', () => {
      const now = Date.now();
      const idleMs = SESSION_EXPIRY_S * 1000 + 1000; // well over 1 hour

      // Register parent session and subagent
      sm.registerAgent(makeAgent('parent-1', 'parent-agent'));
      sm.addSession(makeSession('parent-1', 'project-a', { lastActivity: now }));

      sm.registerAgent(makeAgent('sub-1', 'sub-worker', {
        isSubagent: true,
        parentAgentId: 'parent-1',
        status: 'idle',
      }));

      // Track subagent as idle for over an hour
      const tracked = makeTrackedSession('sub-1', {
        lastActivity: now - idleMs,
        isSolo: true, // subagents have isSolo=true in tracked sessions
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      // The subagent should NOT be treated as a session expiry
      // (it's removed by the 5-min subagent removal, not the 1-hour session expiry)
      // The trackedSession entry may be removed by the subagent 5-min cleanup,
      // but the session expiry code should not fire since it checks !agent?.isSubagent
      expect(sm.getSessions().has('parent-1')).toBe(true);
    });

    it('selects most interesting session after expiring the active session', () => {
      const now = Date.now();
      const idleMs = SESSION_EXPIRY_S * 1000 + 1000;

      // Two sessions: s1 is old/expired, s2 is active
      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'idle' }));
      sm.registerAgent(makeAgent('s2', 'agent-b', { status: 'working' }));

      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now - idleMs }));
      sm.addSession(makeSession('s2', 'project-b', { lastActivity: now }));

      // s2 should be auto-selected (higher lastActivity)
      // but force s1 as active to test the re-selection
      sm.selectSession('s1');
      expect(sm.getState().session?.sessionId).toBe('s1');

      const tracked = makeTrackedSession('s1', {
        lastActivity: now - idleMs,
        isSolo: true,
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);
      ctx.registeredSessions.add('s1');

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      // s1 expired, so selectMostInterestingSession should have picked s2
      expect(sm.getSessions().has('s1')).toBe(false);
      expect(sm.getState().session?.sessionId).toBe('s2');
    });
  });

  describe('idle marking', () => {
    it('marks a working agent as idle after IDLE_THRESHOLD_S', () => {
      const now = Date.now();
      const idleMs = (IDLE_THRESHOLD_S + 5) * 1000; // 65 seconds

      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now - idleMs }));

      const tracked = makeTrackedSession('s1', {
        lastActivity: now - idleMs,
        isSolo: true,
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      const agent = sm.getAgentById('s1');
      expect(agent?.status).toBe('idle');
    });

    it('does NOT mark agent idle if hook activity is recent', () => {
      const now = Date.now();
      const jsonlIdleMs = (IDLE_THRESHOLD_S + 5) * 1000;

      sm.registerAgent(makeAgent('s1', 'agent-a', { status: 'working' }));
      // Session has recent lastActivity from hooks
      sm.addSession(makeSession('s1', 'project-a', { lastActivity: now }));

      const tracked = makeTrackedSession('s1', {
        lastActivity: now - jsonlIdleMs, // JSONL is stale
        isSolo: true,
      });
      ctx.trackedSessions.set(tracked.filePath, tracked);

      const interval = startStalenessChecker(ctx);
      vi.advanceTimersByTime(STALENESS_CHECK_INTERVAL_MS);
      clearInterval(interval);

      // Should remain working because session.lastActivity (from hooks) is recent
      const agent = sm.getAgentById('s1');
      expect(agent?.status).toBe('working');
    });
  });
});
