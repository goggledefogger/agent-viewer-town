import { describe, it, expect } from 'vitest';

/**
 * Regression tests for status animations feature.
 *
 * These test the logic/config behind:
 * 1. Compacting animation detection (AgentCharacter.tsx)
 * 2. Waiting-type visual differentiation (ActionBubble.tsx, Scene.tsx)
 */

// ---- Compacting detection logic (mirrors AgentCharacter.tsx line 208) ----

function isCompacting(agent: { status: string; currentAction?: string }): boolean {
  const isWorking = agent.status === 'working';
  return isWorking && !!(agent.currentAction && agent.currentAction.includes('Compacting'));
}

describe('Compacting animation detection', () => {
  it('detects compacting when status is working and currentAction contains "Compacting"', () => {
    expect(isCompacting({ status: 'working', currentAction: 'Compacting conversation...' })).toBe(true);
  });

  it('detects compacting with just "Compacting" as currentAction', () => {
    expect(isCompacting({ status: 'working', currentAction: 'Compacting' })).toBe(true);
  });

  it('does not detect compacting when status is idle', () => {
    expect(isCompacting({ status: 'idle', currentAction: 'Compacting' })).toBe(false);
  });

  it('does not detect compacting when currentAction is undefined', () => {
    expect(isCompacting({ status: 'working', currentAction: undefined })).toBe(false);
  });

  it('does not detect compacting when currentAction does not contain "Compacting"', () => {
    expect(isCompacting({ status: 'working', currentAction: 'Reading file...' })).toBe(false);
  });

  it('does not detect compacting when status is done', () => {
    expect(isCompacting({ status: 'done', currentAction: 'Compacting' })).toBe(false);
  });
});

// ---- Waiting-type style config (mirrors ActionBubble.tsx getWaitingStyle) ----

type WaitingType = 'permission' | 'question' | 'plan' | 'plan_approval';

function getWaitingStyle(waitingType?: WaitingType) {
  switch (waitingType) {
    case 'permission':
      return { icon: '\uD83D\uDD12', label: 'Permission needed', color: '#F97316' };
    case 'question':
      return { icon: '\u2753', label: 'Question for you', color: '#3B82F6' };
    case 'plan':
      return { icon: '\uD83D\uDCCB', label: 'Plan review', color: '#8B5CF6' };
    case 'plan_approval':
      return { icon: '\u2705', label: 'Approve plan', color: '#22C55E' };
    default:
      return { icon: '\u26A0', label: 'Needs your input!', color: '#EAB308' };
  }
}

describe('Waiting-type visual differentiation', () => {
  it('returns orange for permission waiting type', () => {
    const style = getWaitingStyle('permission');
    expect(style.color).toBe('#F97316');
    expect(style.label).toBe('Permission needed');
  });

  it('returns blue for question waiting type', () => {
    const style = getWaitingStyle('question');
    expect(style.color).toBe('#3B82F6');
    expect(style.label).toBe('Question for you');
  });

  it('returns purple for plan waiting type', () => {
    const style = getWaitingStyle('plan');
    expect(style.color).toBe('#8B5CF6');
    expect(style.label).toBe('Plan review');
  });

  it('returns green for plan_approval waiting type', () => {
    const style = getWaitingStyle('plan_approval');
    expect(style.color).toBe('#22C55E');
    expect(style.label).toBe('Approve plan');
  });

  it('returns gold default when waitingType is undefined', () => {
    const style = getWaitingStyle(undefined);
    expect(style.color).toBe('#EAB308');
    expect(style.label).toBe('Needs your input!');
  });

  it('each waiting type produces a unique color', () => {
    const types: (WaitingType | undefined)[] = ['permission', 'question', 'plan', 'plan_approval', undefined];
    const colors = types.map(t => getWaitingStyle(t).color);
    const unique = new Set(colors);
    expect(unique.size).toBe(types.length);
  });
});

// ---- Waiting ring color logic (mirrors Scene.tsx lines 172-176) ----

function getWaitingRingColor(waitingType?: WaitingType): string {
  return waitingType === 'permission' ? '#F97316'
    : waitingType === 'question' ? '#3B82F6'
    : waitingType === 'plan' ? '#8B5CF6'
    : waitingType === 'plan_approval' ? '#22C55E'
    : '#EAB308';
}

describe('Waiting ring color mapping', () => {
  it('matches ActionBubble colors for each waiting type', () => {
    const types: (WaitingType | undefined)[] = ['permission', 'question', 'plan', 'plan_approval', undefined];
    for (const t of types) {
      expect(getWaitingRingColor(t)).toBe(getWaitingStyle(t).color);
    }
  });

  it('defaults to gold for undefined waitingType', () => {
    expect(getWaitingRingColor(undefined)).toBe('#EAB308');
  });
});
