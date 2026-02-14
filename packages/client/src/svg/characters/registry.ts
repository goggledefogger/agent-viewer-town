/** Character registry — centralizes the mapping from agent role/subagentType
 *  to animal component and accent color.
 *
 *  Previously this logic was scattered across AgentCharacter.tsx (lines 24-30, 162-165). */

import type { AgentState } from '@agent-viewer/shared';
import { ROLE_COLORS } from '../../constants/colors';
import type { CharacterResolution } from './types';
import { Beaver, Owl, Fox, Bear, Rabbit } from './animals';

const ANIMAL_COMPONENTS: Record<string, React.FC<{ stage: number }>> = {
  lead: Beaver,
  researcher: Owl,
  implementer: Fox,
  tester: Bear,
  planner: Rabbit,
};

/** Default animal for subagents (Owl — quick scouts) */
const SUBAGENT_DEFAULT = Owl;
const SUBAGENT_COLOR = '#94a3b8';

export function resolveCharacter(agent: AgentState): CharacterResolution {
  if (agent.isSubagent) {
    return {
      AnimalComponent: SUBAGENT_DEFAULT,
      accentColor: SUBAGENT_COLOR,
    };
  }
  return {
    AnimalComponent: ANIMAL_COMPONENTS[agent.role] || Beaver,
    accentColor: ROLE_COLORS[agent.role] || '#FFD700',
  };
}

export function getEvolutionStage(tasksCompleted: number): number {
  if (tasksCompleted >= 6) return 3;
  if (tasksCompleted >= 3) return 2;
  return 1;
}
