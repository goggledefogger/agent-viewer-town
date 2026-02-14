/** Shared color constants for agent roles, branches, and effects.
 *  Single source of truth — imported by AgentCharacter, Machine, TaskBoard, Scene. */

export const ROLE_COLORS: Record<string, string> = {
  lead: '#FFD700',
  researcher: '#4169E1',
  implementer: '#DC3545',
  tester: '#28A745',
  planner: '#F8F9FA',
};

/** Deterministic color palette for git branches.
 *  Index 0 is reserved for main/master; others hash into the rest. */
export const BRANCH_PALETTE = [
  '#4CAF50', // green — reserved for main/master
  '#42A5F5', // blue — feature branches
  '#FF7043', // orange — fix/hotfix
  '#AB47BC', // purple — release
  '#26C6DA', // cyan — dev/staging
  '#FFCA28', // amber — experiment
];

/** Deterministic color for a branch name — stable across re-renders.
 *  main/master always get green; others hash into the remaining palette. */
export function getBranchColor(branch: string): string {
  const lower = branch.toLowerCase();
  if (lower === 'main' || lower === 'master') return BRANCH_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < branch.length; i++) {
    hash = ((hash << 5) - hash + branch.charCodeAt(i)) | 0;
  }
  // Skip index 0 (reserved for main/master)
  return BRANCH_PALETTE[1 + (Math.abs(hash) % (BRANCH_PALETTE.length - 1))];
}

/** Steam particle colors for working animation */
export const STEAM_COLORS = ['#aaa', '#ccc', '#999', '#bbb'];

/** Spark burst colors for task completion */
export const SPARK_COLORS = ['#FFD700', '#FF6347', '#4169E1', '#28A745', '#FF69B4'];

/** Confetti colors for celebration effect */
export const CONFETTI_COLORS = ['#FFD700', '#DC3545', '#4169E1', '#28A745', '#FF69B4', '#FF8C00'];
