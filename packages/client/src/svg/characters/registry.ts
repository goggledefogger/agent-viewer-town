/** Character registry — centralizes the mapping from agent role/subagentType
 *  to animal component and accent color.
 *
 *  Solo agents (role=implementer) get a deterministic animal based on project path,
 *  so different projects show different characters. Team roles and subagents
 *  keep their fixed mappings. */

import type { AgentState } from '@agent-viewer/shared';
import { ROLE_COLORS } from '../../constants/colors';
import type { CharacterResolution } from './types';
import { Beaver, Owl, Fox, Bear, Rabbit, Squirrel, Chipmunk, Woodpecker, Mouse } from './animals';

export interface ProjectInfo {
  projectPath: string;
  projectName: string;
  gitBranch?: string;
}

const ANIMAL_COMPONENTS: Record<string, React.FC<{ stage: number }>> = {
  lead: Beaver,
  researcher: Owl,
  implementer: Fox,
  tester: Bear,
  planner: Rabbit,
};

const SUBAGENT_COLORS: Record<string, string> = {
  Explore: '#26C6DA',
  Plan: '#FFCA28',
  Bash: '#FF7043',
};

const SUBAGENT_ANIMALS: Record<string, React.FC<{ stage: number }>> = {
  Explore: Squirrel,
  Plan: Chipmunk,
  Bash: Woodpecker,
};

/** Default subagent color when type is unknown */
const SUBAGENT_DEFAULT_COLOR = '#94a3b8';

/** Stable pool of animals and colors for solo (implementer) agents */
const SOLO_ANIMAL_POOL = [Fox, Bear, Beaver, Owl, Rabbit, Squirrel, Chipmunk, Woodpecker, Mouse];
const SOLO_COLOR_POOL = ['#DC3545', '#28A745', '#FFD700', '#4169E1', '#F8F9FA', '#26C6DA', '#FFCA28', '#FF7043', '#94a3b8'];

/** Simple deterministic hash — same string always produces the same number */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function resolveCharacter(agent: AgentState, projectInfo?: ProjectInfo): CharacterResolution {
  if (agent.isSubagent) {
    const subType = agent.subagentType || '';
    return {
      AnimalComponent: SUBAGENT_ANIMALS[subType] || Mouse,
      accentColor: SUBAGENT_COLORS[subType] || SUBAGENT_DEFAULT_COLOR,
    };
  }

  // Solo agents (implementer) get project-based character when projectInfo is available
  if (agent.role === 'implementer' && projectInfo) {
    const index = hashString(projectInfo.projectPath) % SOLO_ANIMAL_POOL.length;
    return {
      AnimalComponent: SOLO_ANIMAL_POOL[index],
      accentColor: SOLO_COLOR_POOL[index],
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
