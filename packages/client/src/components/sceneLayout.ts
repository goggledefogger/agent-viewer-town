import type { AgentState } from '@agent-viewer/shared';
import { getBranchColor } from '../constants/colors';

// Layout positions for agent workstations (team mode -- classic roles)
const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  lead:        { x: 450, y: 200 },
  researcher:  { x: 200, y: 120 },
  implementer: { x: 450, y: 380 },
  tester:      { x: 700, y: 380 },
  planner:     { x: 200, y: 380 },
};

// Center position for solo agent
export const SOLO_POSITION = { x: 450, y: 300 };

// Subagent positions fan out around the parent -- increased vertical gaps to reduce overlap
const SUBAGENT_OFFSETS = [
  { x: 280, y: -60 },
  { x: -280, y: -60 },
  { x: 280, y: 140 },
  { x: -280, y: 140 },
  { x: 0, y: -160 },
];

function getSubagentOffset(index: number, total: number): { x: number; y: number } {
  if (total <= SUBAGENT_OFFSETS.length) {
    return SUBAGENT_OFFSETS[index];
  }
  // Circular layout for many subagents
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  const radius = 160;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

// Grid layout for teams where agents share roles (e.g., all implementers)
function computeTeamPositions(agents: AgentState[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const mainAgents = agents.filter((a) => !a.isSubagent);
  const subagents = agents.filter((a) => a.isSubagent);

  const roleSet = new Set(mainAgents.map((a) => a.role));
  const hasDuplicateRoles = mainAgents.length > roleSet.size;

  if (hasDuplicateRoles || mainAgents.length > 5) {
    const cols = Math.min(mainAgents.length, 4);
    const rows = Math.ceil(mainAgents.length / cols);
    const xPad = 120;
    const yPad = 100;
    const xSpan = 900 - xPad * 2;
    const ySpan = 280;
    const yStart = 140;

    mainAgents.forEach((agent, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = cols === 1 ? 450 : xPad + (col / (cols - 1)) * xSpan;
      const y = rows === 1 ? 280 : yStart + (row / Math.max(rows - 1, 1)) * ySpan;
      positions.set(agent.id, { x, y });
    });
  } else {
    mainAgents.forEach((agent, i) => {
      const pos = STATION_POSITIONS[agent.role] || { x: 200 + i * 180, y: 250 };
      positions.set(agent.id, pos);
    });
  }

  // Position subagents around their parent
  const subsByParent = new Map<string, AgentState[]>();
  for (const sub of subagents) {
    const parentId = sub.parentAgentId || '';
    if (!subsByParent.has(parentId)) subsByParent.set(parentId, []);
    subsByParent.get(parentId)!.push(sub);
  }

  for (const [parentId, subs] of subsByParent) {
    const parentPos = positions.get(parentId) || { x: 450, y: 300 };
    const scale = mainAgents.length > 3 ? 0.5 : 1;
    subs.forEach((sub, si) => {
      let offset: { x: number; y: number };
      if (subs.length <= SUBAGENT_OFFSETS.length) {
        offset = SUBAGENT_OFFSETS[si];
      } else {
        const angle = (si / subs.length) * Math.PI * 2 - Math.PI / 2;
        const radius = 160;
        offset = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      }
      positions.set(sub.id, {
        x: Math.max(60, Math.min(840, parentPos.x + offset.x * scale)),
        y: Math.max(80, Math.min(430, parentPos.y + offset.y * scale)),
      });
    });
  }

  return positions;
}

/** Compute positions for all agents in any mode (solo or team) */
export function computeAllPositions(agents: AgentState[]): Map<string, { x: number; y: number }> {
  const mainAgents = agents.filter((a) => !a.isSubagent);
  const subagents = agents.filter((a) => a.isSubagent);

  if (mainAgents.length <= 1) {
    const positions = new Map<string, { x: number; y: number }>();
    if (mainAgents.length > 0) {
      positions.set(mainAgents[0].id, SOLO_POSITION);
    }
    subagents.forEach((sub, si) => {
      const offset = getSubagentOffset(si, subagents.length);
      positions.set(sub.id, {
        x: Math.max(60, Math.min(840, SOLO_POSITION.x + offset.x)),
        y: Math.max(80, Math.min(430, SOLO_POSITION.y + offset.y)),
      });
    });
    return positions;
  }

  return computeTeamPositions(agents);
}

/** Compute branch lane positions in the ground area (y=488+). */
export function computeBranchLanes(agents: AgentState[]): Map<string, { y: number; color: string }> {
  const branches = new Set<string>();
  for (const agent of agents) {
    if (agent.gitBranch && !agent.isSubagent) branches.add(agent.gitBranch);
  }
  if (branches.size === 0) return new Map();

  const lanes = new Map<string, { y: number; color: string }>();
  const laneHeight = 22;
  const laneStart = 488;
  let i = 0;
  for (const branch of branches) {
    lanes.set(branch, {
      y: laneStart + i * laneHeight,
      color: getBranchColor(branch),
    });
    i++;
  }
  return lanes;
}

/** Compute bounding-box zones for agents grouped by branch. */
export function computeBranchZones(
  agents: AgentState[],
  positions: Map<string, { x: number; y: number }>,
): Array<{ branch: string; x: number; y: number; width: number; height: number; color: string }> {
  const branchAgents = new Map<string, Array<{ x: number; y: number }>>();
  for (const agent of agents) {
    if (!agent.gitBranch || agent.isSubagent) continue;
    const pos = positions.get(agent.id);
    if (!pos) continue;
    if (!branchAgents.has(agent.gitBranch)) branchAgents.set(agent.gitBranch, []);
    branchAgents.get(agent.gitBranch)!.push(pos);
  }
  if (branchAgents.size < 2) return [];

  const pad = 50;
  const zones: Array<{ branch: string; x: number; y: number; width: number; height: number; color: string }> = [];
  for (const [branch, agentPositions] of branchAgents) {
    if (agentPositions.length === 0) continue;
    const xs = agentPositions.map((p) => p.x);
    const ys = agentPositions.map((p) => p.y);
    const minX = Math.max(0, Math.min(...xs) - pad);
    const minY = Math.max(0, Math.min(...ys) - pad);
    const maxX = Math.min(900, Math.max(...xs) + pad);
    const maxY = Math.min(480, Math.max(...ys) + pad);
    zones.push({ branch, x: minX, y: minY, width: maxX - minX, height: maxY - minY, color: getBranchColor(branch) });
  }
  return zones;
}
