import { describe, it, expect } from 'vitest';
import { resolveCharacter, getEvolutionStage } from '../registry';
import { Beaver, Owl, Fox, Bear, Rabbit, Squirrel, Chipmunk, Woodpecker, Mouse } from '../animals';
import type { AgentState } from '@agent-viewer/shared';

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'test-1',
    name: 'test-agent',
    role: 'implementer',
    status: 'idle',
    tasksCompleted: 0,
    ...overrides,
  };
}

describe('resolveCharacter', () => {
  describe('main agent role mapping', () => {
    it('maps lead role to Beaver', () => {
      const result = resolveCharacter(makeAgent({ role: 'lead' }));
      expect(result.AnimalComponent).toBe(Beaver);
    });

    it('maps researcher role to Owl', () => {
      const result = resolveCharacter(makeAgent({ role: 'researcher' }));
      expect(result.AnimalComponent).toBe(Owl);
    });

    it('maps implementer role to Fox', () => {
      const result = resolveCharacter(makeAgent({ role: 'implementer' }));
      expect(result.AnimalComponent).toBe(Fox);
    });

    it('maps tester role to Bear', () => {
      const result = resolveCharacter(makeAgent({ role: 'tester' }));
      expect(result.AnimalComponent).toBe(Bear);
    });

    it('maps planner role to Rabbit', () => {
      const result = resolveCharacter(makeAgent({ role: 'planner' }));
      expect(result.AnimalComponent).toBe(Rabbit);
    });

    it('falls back to Beaver for unknown roles', () => {
      const result = resolveCharacter(makeAgent({ role: 'unknown' as any }));
      expect(result.AnimalComponent).toBe(Beaver);
    });
  });

  describe('main agent accent colors', () => {
    it('uses gold for lead', () => {
      const result = resolveCharacter(makeAgent({ role: 'lead' }));
      expect(result.accentColor).toBe('#FFD700');
    });

    it('uses blue for researcher', () => {
      const result = resolveCharacter(makeAgent({ role: 'researcher' }));
      expect(result.accentColor).toBe('#4169E1');
    });

    it('uses red for implementer', () => {
      const result = resolveCharacter(makeAgent({ role: 'implementer' }));
      expect(result.accentColor).toBe('#DC3545');
    });

    it('uses green for tester', () => {
      const result = resolveCharacter(makeAgent({ role: 'tester' }));
      expect(result.accentColor).toBe('#28A745');
    });

    it('falls back to gold for unknown roles', () => {
      const result = resolveCharacter(makeAgent({ role: 'unknown' as any }));
      expect(result.accentColor).toBe('#FFD700');
    });
  });

  describe('subagent type-specific rendering', () => {
    it('maps Explore subagent to Squirrel with cyan color', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
        subagentType: 'Explore',
      }));
      expect(result.AnimalComponent).toBe(Squirrel);
      expect(result.accentColor).toBe('#26C6DA');
    });

    it('maps Plan subagent to Chipmunk with amber color', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
        subagentType: 'Plan',
      }));
      expect(result.AnimalComponent).toBe(Chipmunk);
      expect(result.accentColor).toBe('#FFCA28');
    });

    it('maps Bash subagent to Woodpecker with orange color', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
        subagentType: 'Bash',
      }));
      expect(result.AnimalComponent).toBe(Woodpecker);
      expect(result.accentColor).toBe('#FF7043');
    });

    it('falls back to Mouse for unknown subagent type', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
        subagentType: 'SomeNewType',
      }));
      expect(result.AnimalComponent).toBe(Mouse);
      expect(result.accentColor).toBe('#94a3b8');
    });

    it('falls back to Mouse when subagentType is undefined', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
      }));
      expect(result.AnimalComponent).toBe(Mouse);
      expect(result.accentColor).toBe('#94a3b8');
    });

    it('ignores role when agent is a subagent', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: true,
        role: 'lead',
        subagentType: 'Explore',
      }));
      // Should use subagent mapping, not role mapping
      expect(result.AnimalComponent).toBe(Squirrel);
      expect(result.accentColor).not.toBe('#FFD700');
    });
  });

  describe('non-subagent agents ignore subagentType', () => {
    it('uses role mapping even if subagentType is set but isSubagent is false', () => {
      const result = resolveCharacter(makeAgent({
        isSubagent: false,
        role: 'tester',
        subagentType: 'Explore',
      }));
      expect(result.AnimalComponent).toBe(Bear);
      expect(result.accentColor).toBe('#28A745');
    });
  });
});

describe('getEvolutionStage', () => {
  it('returns stage 1 for 0 tasks', () => {
    expect(getEvolutionStage(0)).toBe(1);
  });

  it('returns stage 1 for 1-2 tasks', () => {
    expect(getEvolutionStage(1)).toBe(1);
    expect(getEvolutionStage(2)).toBe(1);
  });

  it('returns stage 2 for 3-5 tasks', () => {
    expect(getEvolutionStage(3)).toBe(2);
    expect(getEvolutionStage(4)).toBe(2);
    expect(getEvolutionStage(5)).toBe(2);
  });

  it('returns stage 3 for 6+ tasks', () => {
    expect(getEvolutionStage(6)).toBe(3);
    expect(getEvolutionStage(10)).toBe(3);
    expect(getEvolutionStage(100)).toBe(3);
  });
});
