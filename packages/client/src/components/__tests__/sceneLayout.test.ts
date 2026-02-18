import { describe, it, expect } from 'vitest';
import type { AgentState } from '@agent-viewer/shared';
import { computeAllPositions, computeBranchLanes, computeBranchZones, SOLO_POSITION } from '../sceneLayout';

function makeAgent(overrides?: Partial<AgentState>): AgentState {
  return {
    id: 'agent-1',
    name: 'test-agent',
    role: 'implementer',
    status: 'working',
    tasksCompleted: 0,
    ...overrides,
  };
}

describe('computeAllPositions', () => {
  it('places a single main agent at SOLO_POSITION', () => {
    const agents = [makeAgent({ id: 'a1' })];
    const positions = computeAllPositions(agents);
    expect(positions.get('a1')).toEqual(SOLO_POSITION);
  });

  it('places subagents around the solo parent', () => {
    const agents = [
      makeAgent({ id: 'parent' }),
      makeAgent({ id: 'sub1', isSubagent: true, parentAgentId: 'parent' }),
      makeAgent({ id: 'sub2', isSubagent: true, parentAgentId: 'parent' }),
    ];
    const positions = computeAllPositions(agents);
    expect(positions.get('parent')).toEqual(SOLO_POSITION);
    const sub1Pos = positions.get('sub1')!;
    const sub2Pos = positions.get('sub2')!;
    // Subagents should be offset from parent
    expect(sub1Pos.x).not.toBe(SOLO_POSITION.x);
    expect(sub2Pos.x).not.toBe(SOLO_POSITION.x);
    // Should be different from each other
    expect(sub1Pos).not.toEqual(sub2Pos);
  });

  it('uses role-based positions for team mode with unique roles', () => {
    const agents = [
      makeAgent({ id: 'a1', role: 'lead' }),
      makeAgent({ id: 'a2', role: 'researcher' }),
      makeAgent({ id: 'a3', role: 'tester' }),
    ];
    const positions = computeAllPositions(agents);
    // Lead should be at lead position (450, 200)
    expect(positions.get('a1')).toEqual({ x: 450, y: 200 });
    // Researcher at (200, 120)
    expect(positions.get('a2')).toEqual({ x: 200, y: 120 });
    // Tester at (700, 380)
    expect(positions.get('a3')).toEqual({ x: 700, y: 380 });
  });

  it('uses grid layout for duplicate roles', () => {
    const agents = [
      makeAgent({ id: 'a1', role: 'implementer' }),
      makeAgent({ id: 'a2', role: 'implementer' }),
      makeAgent({ id: 'a3', role: 'implementer' }),
    ];
    const positions = computeAllPositions(agents);
    // All should have positions
    expect(positions.size).toBe(3);
    // Should NOT be at the same spot
    const unique = new Set([...positions.values()].map(p => `${p.x},${p.y}`));
    expect(unique.size).toBe(3);
  });

  it('handles zero agents', () => {
    const positions = computeAllPositions([]);
    expect(positions.size).toBe(0);
  });

  it('clamps subagent positions within bounds', () => {
    const agents = [
      makeAgent({ id: 'parent' }),
      makeAgent({ id: 'sub1', isSubagent: true, parentAgentId: 'parent' }),
      makeAgent({ id: 'sub2', isSubagent: true, parentAgentId: 'parent' }),
      makeAgent({ id: 'sub3', isSubagent: true, parentAgentId: 'parent' }),
      makeAgent({ id: 'sub4', isSubagent: true, parentAgentId: 'parent' }),
      makeAgent({ id: 'sub5', isSubagent: true, parentAgentId: 'parent' }),
    ];
    const positions = computeAllPositions(agents);
    for (const [, pos] of positions) {
      expect(pos.x).toBeGreaterThanOrEqual(60);
      expect(pos.x).toBeLessThanOrEqual(840);
      expect(pos.y).toBeGreaterThanOrEqual(80);
      expect(pos.y).toBeLessThanOrEqual(430);
    }
  });
});

describe('computeBranchLanes', () => {
  it('returns empty map when no agents have branches', () => {
    const agents = [makeAgent({ id: 'a1' })];
    const lanes = computeBranchLanes(agents);
    expect(lanes.size).toBe(0);
  });

  it('creates one lane per unique branch', () => {
    const agents = [
      makeAgent({ id: 'a1', gitBranch: 'main' }),
      makeAgent({ id: 'a2', gitBranch: 'feature' }),
      makeAgent({ id: 'a3', gitBranch: 'main' }),
    ];
    const lanes = computeBranchLanes(agents);
    expect(lanes.size).toBe(2);
    expect(lanes.has('main')).toBe(true);
    expect(lanes.has('feature')).toBe(true);
  });

  it('ignores subagent branches', () => {
    const agents = [
      makeAgent({ id: 'a1', gitBranch: 'main' }),
      makeAgent({ id: 'sub1', isSubagent: true, gitBranch: 'sub-branch' }),
    ];
    const lanes = computeBranchLanes(agents);
    expect(lanes.size).toBe(1);
    expect(lanes.has('main')).toBe(true);
    expect(lanes.has('sub-branch')).toBe(false);
  });

  it('assigns different y positions to different branches', () => {
    const agents = [
      makeAgent({ id: 'a1', gitBranch: 'branch-a' }),
      makeAgent({ id: 'a2', gitBranch: 'branch-b' }),
    ];
    const lanes = computeBranchLanes(agents);
    const aY = lanes.get('branch-a')!.y;
    const bY = lanes.get('branch-b')!.y;
    expect(aY).not.toBe(bY);
  });
});

describe('computeBranchZones', () => {
  it('returns empty array when fewer than 2 branches', () => {
    const agents = [makeAgent({ id: 'a1', gitBranch: 'main' })];
    const positions = new Map([['a1', { x: 450, y: 300 }]]);
    const zones = computeBranchZones(agents, positions);
    expect(zones).toEqual([]);
  });

  it('creates zones for 2+ branches', () => {
    const agents = [
      makeAgent({ id: 'a1', gitBranch: 'main' }),
      makeAgent({ id: 'a2', gitBranch: 'feature' }),
    ];
    const positions = new Map([
      ['a1', { x: 200, y: 200 }],
      ['a2', { x: 600, y: 400 }],
    ]);
    const zones = computeBranchZones(agents, positions);
    expect(zones.length).toBe(2);
    expect(zones.map(z => z.branch).sort()).toEqual(['feature', 'main']);
  });

  it('ignores subagents for zone computation', () => {
    const agents = [
      makeAgent({ id: 'a1', gitBranch: 'main' }),
      makeAgent({ id: 'a2', gitBranch: 'feature' }),
      makeAgent({ id: 'sub1', isSubagent: true, gitBranch: 'main' }),
    ];
    const positions = new Map([
      ['a1', { x: 200, y: 200 }],
      ['a2', { x: 600, y: 400 }],
      ['sub1', { x: 250, y: 250 }],
    ]);
    const zones = computeBranchZones(agents, positions);
    // Zones should only reflect main agents
    const mainZone = zones.find(z => z.branch === 'main')!;
    // Zone should be centered on a1's position, not sub1
    expect(mainZone.x).toBeLessThanOrEqual(200);
    expect(mainZone.width).toBeLessThanOrEqual(100); // Just padding around single agent
  });
});
