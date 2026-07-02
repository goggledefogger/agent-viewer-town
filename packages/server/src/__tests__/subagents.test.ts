import { describe, it, expect, vi } from 'vitest';
import { cleanPendingSpawns } from '../hooks/subagents';
import type { PendingSpawn } from '../hooks/types';

describe('cleanPendingSpawns', () => {
  it('removes entries older than 60 seconds', () => {
    const fixedNow = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const pendingTaskSpawns = new Map<string, PendingSpawn>();

    pendingTaskSpawns.set('old', {
      description: 'old task',
      prompt: 'prompt',
      subagentType: 'implementer',
      sessionId: 'sess-1',
      timestamp: fixedNow - 60_001,
    });

    pendingTaskSpawns.set('recent', {
      description: 'recent task',
      prompt: 'prompt',
      subagentType: 'implementer',
      sessionId: 'sess-1',
      timestamp: fixedNow - 30_000,
    });

    cleanPendingSpawns(pendingTaskSpawns);

    expect(pendingTaskSpawns.has('old')).toBe(false);
    expect(pendingTaskSpawns.has('recent')).toBe(true);

    vi.restoreAllMocks();
  });

  it('keeps entries exactly 60 seconds old', () => {
    const fixedNow = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const pendingTaskSpawns = new Map<string, PendingSpawn>();

    pendingTaskSpawns.set('boundary', {
      description: 'boundary task',
      prompt: 'prompt',
      subagentType: 'implementer',
      sessionId: 'sess-1',
      timestamp: fixedNow - 60_000,
    });

    cleanPendingSpawns(pendingTaskSpawns);

    expect(pendingTaskSpawns.has('boundary')).toBe(true);

    vi.restoreAllMocks();
  });

  it('handles an empty map', () => {
    const pendingTaskSpawns = new Map<string, PendingSpawn>();

    expect(() => cleanPendingSpawns(pendingTaskSpawns)).not.toThrow();
    expect(pendingTaskSpawns.size).toBe(0);
  });

  it('removes multiple stale entries', () => {
    const fixedNow = 1000000;
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    const pendingTaskSpawns = new Map<string, PendingSpawn>();

    pendingTaskSpawns.set('stale1', {
      description: 'stale 1',
      prompt: 'p1',
      subagentType: 'implementer',
      sessionId: 's1',
      timestamp: fixedNow - 100_000,
    });

    pendingTaskSpawns.set('stale2', {
      description: 'stale 2',
      prompt: 'p2',
      subagentType: 'implementer',
      sessionId: 's2',
      timestamp: fixedNow - 60_001,
    });

    pendingTaskSpawns.set('fresh', {
      description: 'fresh',
      prompt: 'p3',
      subagentType: 'implementer',
      sessionId: 's3',
      timestamp: fixedNow,
    });

    cleanPendingSpawns(pendingTaskSpawns);

    expect(pendingTaskSpawns.size).toBe(1);
    expect(pendingTaskSpawns.has('fresh')).toBe(true);

    vi.restoreAllMocks();
  });
});
