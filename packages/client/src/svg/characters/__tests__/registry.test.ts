import { describe, it, expect } from 'vitest';
import { resolveCharacter, getEvolutionStage, hashString } from '../registry';
import type { ProjectInfo } from '../registry';
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

  describe('project-based character assignment for solo agents', () => {
    const projectA: ProjectInfo = { projectPath: '/Users/Danny/Source/project-alpha', projectName: 'project-alpha' };
    const projectB: ProjectInfo = { projectPath: '/Users/Danny/Source/project-beta', projectName: 'project-beta' };
    const SOLO_POOL = [Fox, Bear, Beaver, Owl, Rabbit, Squirrel, Chipmunk, Woodpecker, Mouse];

    it('is deterministic — same project path always gives the same animal', () => {
      const agent = makeAgent({ role: 'implementer' });
      const result1 = resolveCharacter(agent, projectA);
      const result2 = resolveCharacter(agent, projectA);
      expect(result1.AnimalComponent).toBe(result2.AnimalComponent);
      expect(result1.accentColor).toBe(result2.accentColor);
    });

    it('different project paths produce different animals for enough variety', () => {
      const agent = makeAgent({ role: 'implementer' });
      const paths = Array.from({ length: 20 }, (_, i) => `/projects/project-${i}`);
      const animals = new Set(paths.map(p =>
        resolveCharacter(agent, { projectPath: p, projectName: `project-${p}` }).AnimalComponent
      ));
      // With 20 paths and 9 animals, we should see at least 4 distinct animals
      expect(animals.size).toBeGreaterThanOrEqual(4);
    });

    it('selects from the solo animal pool', () => {
      const agent = makeAgent({ role: 'implementer' });
      const result = resolveCharacter(agent, projectA);
      expect(SOLO_POOL).toContain(result.AnimalComponent);
    });

    it('falls back to Fox when no projectInfo is provided', () => {
      const result = resolveCharacter(makeAgent({ role: 'implementer' }));
      expect(result.AnimalComponent).toBe(Fox);
      expect(result.accentColor).toBe('#DC3545');
    });

    it('does NOT use project-based assignment for non-implementer roles', () => {
      const result = resolveCharacter(makeAgent({ role: 'lead' }), projectA);
      expect(result.AnimalComponent).toBe(Beaver);
    });

    it('does NOT use project-based assignment for subagents', () => {
      const result = resolveCharacter(
        makeAgent({ isSubagent: true, subagentType: 'Explore' }),
        projectA,
      );
      expect(result.AnimalComponent).toBe(Squirrel);
    });

    it('accent color matches the animal pool index', () => {
      const agent = makeAgent({ role: 'implementer' });
      const SOLO_COLORS = ['#DC3545', '#28A745', '#FFD700', '#4169E1', '#F8F9FA', '#26C6DA', '#FFCA28', '#FF7043', '#94a3b8'];
      const result = resolveCharacter(agent, projectA);
      const idx = SOLO_POOL.indexOf(result.AnimalComponent);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(result.accentColor).toBe(SOLO_COLORS[idx]);
    });
  });
});

describe('hashString', () => {
  it('is deterministic', () => {
    expect(hashString('test')).toBe(hashString('test'));
  });

  it('returns non-negative values', () => {
    expect(hashString('test')).toBeGreaterThanOrEqual(0);
    expect(hashString('')).toBeGreaterThanOrEqual(0);
    expect(hashString('a very long path /Users/Danny/Source/my-project')).toBeGreaterThanOrEqual(0);
  });

  it('produces different values for different strings', () => {
    expect(hashString('project-a')).not.toBe(hashString('project-b'));
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
