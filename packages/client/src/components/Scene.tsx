import { useState, useMemo, useEffect } from 'react';
import type { TeamState, AgentState } from '@agent-viewer/shared';
import { AgentCharacter } from './AgentCharacter';
import { getBranchColor } from '../constants/colors';
import { Machine } from './Machine';

interface SceneProps {
  state: TeamState;
  className?: string;
  focusAgentId?: string | null;
  onFocusTask?: (taskId: string) => void;
}

// Layout positions for agent workstations (team mode — classic roles)
const STATION_POSITIONS: Record<string, { x: number; y: number }> = {
  lead:        { x: 450, y: 200 },
  researcher:  { x: 200, y: 120 },
  implementer: { x: 450, y: 380 },
  tester:      { x: 700, y: 380 },
  planner:     { x: 200, y: 380 },
};

// Grid layout for teams where agents share roles (e.g., all implementers)
// Arranges agents in rows across the viewport
function computeTeamPositions(agents: AgentState[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const mainAgents = agents.filter((a) => !a.isSubagent);
  const subagents = agents.filter((a) => a.isSubagent);

  // Check if agents have unique roles or if any roles are duplicated
  const roleSet = new Set(mainAgents.map((a) => a.role));
  const hasDuplicateRoles = mainAgents.length > roleSet.size;

  if (hasDuplicateRoles || mainAgents.length > 5) {
    // Dynamic grid layout: spread agents evenly
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
    // Classic role-based positions
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
        // Use predefined offsets for small counts
        offset = SUBAGENT_OFFSETS[si];
      } else {
        // Circular layout for many subagents — evenly spaced around parent
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

// Center position for solo agent
const SOLO_POSITION = { x: 450, y: 300 };

// Subagent positions fan out around the parent — increased vertical gaps to reduce overlap
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

/** Compute positions for all agents in any mode (solo or team) */
function computeAllPositions(agents: AgentState[]): Map<string, { x: number; y: number }> {
  const mainAgents = agents.filter((a) => !a.isSubagent);
  const subagents = agents.filter((a) => a.isSubagent);

  if (mainAgents.length <= 1) {
    // Solo mode: main agent centered, subagents fanned around it
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

  // Team mode: classic roles or dynamic grid with subagent placement
  return computeTeamPositions(agents);
}

/** Prominent alert bubble when agent needs user input */
function WaitingBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  const label = '\u26A0 Needs your input!';
  const subtext = agent.currentAction || 'Waiting for approval';
  const context = agent.actionContext;
  const maxLen = 30;
  const displaySub = subtext.length > maxLen ? subtext.slice(0, maxLen - 1) + '\u2026' : subtext;
  const displayCtx = context && context.length > 28 ? context.slice(0, 27) + '\u2026' : context;
  const hasContext = !!displayCtx;
  const bubbleHeight = hasContext ? 42 : 32;
  const boxWidth = Math.max(140, Math.max(label.length, displaySub.length, (displayCtx || '').length) * 5.5 + 28);

  return (
    <g transform={`translate(${x}, ${y - 55})`}>
      {/* Pulsing glow behind the bubble */}
      <rect
        x={-boxWidth / 2 - 3}
        y="-20"
        width={boxWidth + 6}
        height={bubbleHeight + 4}
        rx="8"
        fill="#FFD700"
        opacity="0.15"
      >
        <animate attributeName="opacity" values="0.1;0.25;0.1" dur="1.5s" repeatCount="indefinite" />
      </rect>
      {/* Bubble */}
      <rect
        x={-boxWidth / 2}
        y="-18"
        width={boxWidth}
        height={bubbleHeight}
        rx="6"
        fill="#1a1a2e"
        stroke="#FFD700"
        strokeWidth="2"
        opacity="0.97"
      />
      <polygon points={`-5,${bubbleHeight - 18} 5,${bubbleHeight - 18} 0,${bubbleHeight - 13}`} fill="#1a1a2e" stroke="#FFD700" strokeWidth="2" />
      <rect x="-6" y={bubbleHeight - 20} width="12" height="4" fill="#1a1a2e" />
      {/* Alert text */}
      <text x="0" y="-4" textAnchor="middle" fill="#FFD700" fontSize="8" fontFamily="'Courier New', monospace" fontWeight="bold">
        {label}
        <animate attributeName="opacity" values="1;0.6;1" dur="1.2s" repeatCount="indefinite" />
      </text>
      {/* Action */}
      <text x="0" y="8" textAnchor="middle" fill="#94a3b8" fontSize="7" fontFamily="'Courier New', monospace">
        {displaySub}
      </text>
      {/* Context line */}
      {hasContext && (
        <text x="0" y="18" textAnchor="middle" fill="#64748b" fontSize="6.5" fontFamily="'Courier New', monospace">
          {displayCtx}
        </text>
      )}
    </g>
  );
}

/** Speech bubble showing current action — used for all agents */
function ActionBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  // Show prominent alert when waiting for user input (only if not idle)
  if (agent.waitingForInput && agent.status !== 'idle') {
    return <WaitingBubble agent={agent} x={x} y={y} />;
  }

  const isWorking = agent.status === 'working';
  const isDone = agent.status === 'done';
  // Don't show "Done" text — the green checkmark in AgentCharacter is sufficient
  const text = agent.currentAction || (isWorking ? 'Working...' : '');
  // Always show something for subagents (their name describes what they're doing)
  if (!text && !isWorking && !agent.isSubagent) return null;
  // Skip bubble entirely for done agents with no specific action
  if (isDone && !agent.currentAction) return null;
  // For idle subagents with no action, show type-prefixed name as context
  const displayText = text || (agent.isSubagent
    ? (agent.subagentType ? `[${agent.subagentType}] ${agent.name}` : agent.name)
    : '');

  if (isWorking && !displayText) {
    // Typing dots when working but no specific action
    return (
      <g transform={`translate(${x}, ${y - 50})`}>
        <rect x="-22" y="-12" width="44" height="18" rx="4" fill="#16213e" stroke="#334155" strokeWidth="1" opacity="0.95" />
        <polygon points="-4,6 4,6 0,11" fill="#16213e" stroke="#334155" strokeWidth="1" />
        <rect x="-5" y="5" width="10" height="2" fill="#16213e" />
        {[0, 1, 2].map((dot) => (
          <circle key={dot} cx={-5 + dot * 5} cy="-2" r="1.5" fill="#e2e8f0">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="1s" begin={`${dot * 0.2}s`} repeatCount="indefinite" />
          </circle>
        ))}
      </g>
    );
  }

  const maxLen = 32;
  const display = displayText.length > maxLen ? displayText.slice(0, maxLen - 1) + '\u2026' : displayText;
  const context = agent.actionContext;
  const maxCtxLen = 28;
  const displayCtx = context && context.length > maxCtxLen ? context.slice(0, maxCtxLen - 1) + '\u2026' : context;
  const hasContext = !!displayCtx;
  const bubbleHeight = hasContext ? 32 : 22;
  const boxWidth = Math.max(80, Math.max(display.length, (displayCtx || '').length) * 5.2 + 24);

  return (
    <g transform={`translate(${x}, ${y - 50})`}>
      <rect
        x={-boxWidth / 2}
        y="-14"
        width={boxWidth}
        height={bubbleHeight}
        rx="4"
        fill="#16213e"
        stroke="#334155"
        strokeWidth="1"
        opacity="0.95"
      />
      <polygon points={`-4,${bubbleHeight - 14} 4,${bubbleHeight - 14} 0,${bubbleHeight - 9}`} fill="#16213e" stroke="#334155" strokeWidth="1" />
      <rect x="-5" y={bubbleHeight - 15} width="10" height="2" fill="#16213e" />
      <text x="0" y={hasContext ? "-3" : "0"} textAnchor="middle" fill="#e2e8f0" fontSize="7.5" fontFamily="'Courier New', monospace">
        {display}
        {isWorking && (
          <tspan fill="#e2e8f0">
            <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
            {'_'}
          </tspan>
        )}
      </text>
      {hasContext && (
        <text x="0" y="9" textAnchor="middle" fill="#64748b" fontSize="6.5" fontFamily="'Courier New', monospace">
          {displayCtx}
        </text>
      )}
    </g>
  );
}

/** Format a relative time string from a timestamp */
function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Word-wrap text into lines of maxLen chars */
function wrapText(text: string, maxLen: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxLen) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Detail popover shown when clicking an agent */
function AgentDetail({ agent, x, y, onClose, tasks }: { agent: AgentState; x: number; y: number; onClose: () => void; tasks?: import('@agent-viewer/shared').TaskState[] }) {
  const name = agent.name;
  const action = agent.currentAction || (agent.status === 'done' ? 'Done' : agent.status === 'working' ? 'Working...' : 'Idle');
  const role = agent.isSubagent
    ? (agent.subagentType ? `${agent.subagentType} subagent` : 'Subagent')
    : agent.role.charAt(0).toUpperCase() + agent.role.slice(1);
  const statusColor = agent.status === 'working' ? '#4169E1' : agent.status === 'done' ? '#28A745' : '#94a3b8';
  const statusLabel = agent.waitingForInput ? 'waiting' : agent.status;

  const nameLines = wrapText(name, 44);
  const actionLines = wrapText(action, 44);
  const contextLine = agent.actionContext ? agent.actionContext.slice(0, 44) : '';

  // Find current task info
  const currentTask = agent.currentTaskId && tasks
    ? tasks.find(t => t.id === agent.currentTaskId)
    : undefined;

  // Recent actions (last 5)
  const recentActions = agent.recentActions || [];

  const lineHeight = 11;
  const headerHeight = 18;
  const hasBranch = !!agent.gitBranch;

  let contentLines = nameLines.length + actionLines.length + 1;
  if (contextLine) contentLines += 1;
  if (hasBranch) contentLines += 3; // label + branch name + push status
  if (currentTask) contentLines += 2; // label + task subject
  if (recentActions.length > 0) contentLines += 1 + Math.min(recentActions.length, 3); // label + entries
  const bodyHeight = contentLines * lineHeight + 8;
  const totalHeight = headerHeight + bodyHeight + 8;
  const boxWidth = 260;

  // Position: above the agent, clamped to viewport (arrow tip adds ~6px below popY)
  const popX = Math.max(boxWidth / 2 + 5, Math.min(900 - boxWidth / 2 - 5, x));
  const popY = Math.min(590, Math.max(totalHeight + 10, y - 70));

  let cursorY = headerHeight + 12;

  return (
    <g>
      {/* Transparent backdrop to catch clicks for closing */}
      <rect width="900" height="600" fill="transparent" onClick={onClose} style={{ cursor: 'default' }} />
      <g transform={`translate(${popX}, ${popY - totalHeight})`}>
        {/* Shadow */}
        <rect x={-boxWidth / 2 - 2} y="-2" width={boxWidth + 4} height={totalHeight + 4} rx="8" fill="rgba(0,0,0,0.4)" />
        {/* Background */}
        <rect x={-boxWidth / 2} y="0" width={boxWidth} height={totalHeight} rx="6" fill="#0f3460" stroke="#4169E1" strokeWidth="1.5" />
        {/* Header bar */}
        <rect x={-boxWidth / 2} y="0" width={boxWidth} height={headerHeight} rx="6" fill="#16213e" />
        <rect x={-boxWidth / 2} y="12" width={boxWidth} height="6" fill="#16213e" />
        {/* Role + status */}
        <text x={-boxWidth / 2 + 8} y="13" fill={statusColor} fontSize="8" fontFamily="'Courier New', monospace" fontWeight="bold">
          {role} | {statusLabel}
        </text>
        <circle cx={boxWidth / 2 - 12} cy="9" r="4" fill={statusColor} opacity="0.8">
          {agent.status === 'working' && (
            <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
          )}
        </circle>
        {/* Name lines */}
        {nameLines.map((line, i) => {
          const yPos = cursorY + i * lineHeight;
          return (
            <text key={`n${i}`} x={-boxWidth / 2 + 8} y={yPos}
                  fill="#e2e8f0" fontSize="7.5" fontFamily="'Courier New', monospace">
              {line}
            </text>
          );
        })}
        {(() => { cursorY += nameLines.length * lineHeight; return null; })()}
        {/* Divider */}
        <line x1={-boxWidth / 2 + 8} y1={cursorY - 4}
              x2={boxWidth / 2 - 8} y2={cursorY - 4}
              stroke="#334155" strokeWidth="0.5" />
        {/* Current Action */}
        {actionLines.map((line, i) => {
          const yPos = cursorY + 6 + i * lineHeight;
          return (
            <text key={`a${i}`} x={-boxWidth / 2 + 8} y={yPos}
                  fill="#94a3b8" fontSize="7" fontFamily="'Courier New', monospace">
              {line}
            </text>
          );
        })}
        {(() => { cursorY += 6 + actionLines.length * lineHeight; return null; })()}
        {/* Action context */}
        {contextLine && (
          <text x={-boxWidth / 2 + 8} y={cursorY}
                fill="#64748b" fontSize="6.5" fontFamily="'Courier New', monospace">
            {contextLine}
          </text>
        )}
        {(() => { if (contextLine) cursorY += lineHeight; return null; })()}
        {/* Git Branch */}
        {hasBranch && (<>
          <text x={-boxWidth / 2 + 8} y={cursorY + 2}
                fill={getBranchColor(agent.gitBranch!)} fontSize="6.5" fontFamily="'Courier New', monospace" fontWeight="bold">
            {'\u2387'} BRANCH
          </text>
          <text x={-boxWidth / 2 + 8} y={cursorY + 2 + lineHeight}
                fill="#94a3b8" fontSize="7" fontFamily="'Courier New', monospace">
            {agent.gitBranch}{agent.gitWorktree ? ' (worktree)' : ''}
          </text>
          {/* Git push status line */}
          <text x={-boxWidth / 2 + 8} y={cursorY + 2 + lineHeight * 2}
                fill={agent.gitHasUpstream === false ? '#FF7043' : (agent.gitAhead || agent.gitBehind) ? '#FFCA28' : '#64748b'}
                fontSize="6.5" fontFamily="'Courier New', monospace">
            {agent.gitHasUpstream === false
              ? 'Not pushed to remote'
              : (agent.gitAhead || 0) > 0 && (agent.gitBehind || 0) > 0
                ? `${agent.gitAhead} ahead, ${agent.gitBehind} behind`
                : (agent.gitAhead || 0) > 0
                  ? `${agent.gitAhead} commit${agent.gitAhead === 1 ? '' : 's'} ahead`
                  : (agent.gitBehind || 0) > 0
                    ? `${agent.gitBehind} commit${agent.gitBehind === 1 ? '' : 's'} behind`
                    : 'Up to date'}
            {agent.gitDirty ? ' \u2022 dirty' : ''}
          </text>
        </>)}
        {(() => { if (hasBranch) cursorY += 2 + 3 * lineHeight; return null; })()}
        {/* Current Task */}
        {currentTask && (<>
          <text x={-boxWidth / 2 + 8} y={cursorY + 2}
                fill="#4169E1" fontSize="6.5" fontFamily="'Courier New', monospace" fontWeight="bold">
            CURRENT TASK
          </text>
          <text x={-boxWidth / 2 + 8} y={cursorY + 2 + lineHeight}
                fill="#94a3b8" fontSize="7" fontFamily="'Courier New', monospace">
            #{currentTask.id}: {currentTask.subject.slice(0, 38)}
          </text>
        </>)}
        {(() => { if (currentTask) cursorY += 2 + 2 * lineHeight; return null; })()}
        {/* Recent Actions */}
        {recentActions.length > 0 && (<>
          <text x={-boxWidth / 2 + 8} y={cursorY + 2}
                fill="#4169E1" fontSize="6.5" fontFamily="'Courier New', monospace" fontWeight="bold">
            RECENT
          </text>
          {recentActions.slice(-3).reverse().map((ra, i) => (
            <text key={`r${i}`} x={-boxWidth / 2 + 8} y={cursorY + 2 + (i + 1) * lineHeight}
                  fill="#64748b" fontSize="6.5" fontFamily="'Courier New', monospace">
              {relativeTime(ra.timestamp)}  {ra.action.slice(0, 34)}
            </text>
          ))}
        </>)}
        {/* Pointer arrow */}
        <polygon
          points={`${x - popX - 5},${totalHeight} ${x - popX + 5},${totalHeight} ${x - popX},${totalHeight + 6}`}
          fill="#0f3460" stroke="#4169E1" strokeWidth="1"
        />
        <rect x={x - popX - 6} y={totalHeight - 1} width="12" height="2" fill="#0f3460" />
      </g>
    </g>
  );
}

/** Compute branch lane positions in the ground area (y=488+).
 *  Single-branch: one subtle lane, no tethers.
 *  Multi-branch: colored lanes with tether lines to agents. */
function computeBranchLanes(agents: AgentState[]): Map<string, { y: number; color: string }> {
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

/** Compute bounding-box zones for agents grouped by branch.
 *  Returns a colored rect encompassing all agents on each branch (with padding).
 *  Only meaningful when 2+ branches exist. */
function computeBranchZones(
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
  // Only draw zones when multiple branches exist
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
    zones.push({
      branch,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      color: getBranchColor(branch),
    });
  }
  return zones;
}

export function Scene({ state, className, focusAgentId, onFocusTask }: SceneProps) {
  const mainAgents = useMemo(() => state.agents.filter((a) => !a.isSubagent), [state.agents]);
  const subagents = useMemo(() => state.agents.filter((a) => a.isSubagent), [state.agents]);
  // Solo mode: one main agent, possibly with subagents
  const isSoloMode = mainAgents.length <= 1;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // --- Zoom & Pan State ---
  // Default viewBox: x=0, y=0, w=900, h=600
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: 900, h: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Zoom constraints
  const MIN_ZOOM = 0.4;  // Zoomed out (see more)
  const MAX_ZOOM = 2.5;  // Zoomed in (see details)
  const BASE_WIDTH = 900;
  const BASE_HEIGHT = 600;

  // Helper to clamp values
  const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

  // Handle Zoom (Wheel)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Browser zoom - let it happen or handle pinch?
      // For now, standard wheel zoom
    }

    const zoomStep = 0.1;
    const direction = e.deltaY > 0 ? 1 : -1; // deltaY > 0 is scroll down (zoom out)
    const currentZoom = BASE_WIDTH / viewport.w;
    let newZoom = currentZoom - direction * zoomStep;
    newZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);

    const newW = BASE_WIDTH / newZoom;
    const newH = BASE_HEIGHT / newZoom;

    // Zoom centered on pointer requires complex math for SVG coordinates.
    // For simplicity/stability, we zoom centered on the current view center first,
    // which is predictable and standard for this type of view.
    const centerX = viewport.x + viewport.w / 2;
    const centerY = viewport.y + viewport.h / 2;

    const newX = centerX - newW / 2;
    const newY = centerY - newH / 2;

    setViewport({ x: newX, y: newY, w: newW, h: newH });
  };

  // Handle Pan (Drag)
  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag with left mouse button
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    // Delta in screen pixels
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Convert to SVG units based on current zoom
    // SVG width / screen width = ratio
    // But simplier: viewport.w / clientWidth (approx if 100% width)
    // Actually, we can just use a sensitivity factor or use the ratio if container ref exist.
    // Let's assume standard behavior: 
    // If we move mouse right, we drag the "paper" right, so the view (camera) moves LEFT.
    // viewport.x -= dx * (viewport.w / svgWidth)
    // For now, using a calculated ratio:
    const svgEl = e.currentTarget.closest('svg');
    const ratio = svgEl ? viewport.w / svgEl.clientWidth : 1;
    
    setViewport(prev => ({
      ...prev,
      x: prev.x - dx * ratio,
      y: prev.y - dy * ratio
    }));
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  // Zoom Buttons Handlers
  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentZoom = BASE_WIDTH / viewport.w;
    const newZoom = clamp(currentZoom + 0.2, MIN_ZOOM, MAX_ZOOM);
    const newW = BASE_WIDTH / newZoom;
    const newH = BASE_HEIGHT / newZoom;
    
    // Keep center
    const centerX = viewport.x + viewport.w / 2;
    const centerY = viewport.y + viewport.h / 2;
    
    setViewport({ x: centerX - newW/2, y: centerY - newH/2, w: newW, h: newH });
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    const currentZoom = BASE_WIDTH / viewport.w;
    const newZoom = clamp(currentZoom - 0.2, MIN_ZOOM, MAX_ZOOM);
    const newW = BASE_WIDTH / newZoom;
    const newH = BASE_HEIGHT / newZoom;
    
    const centerX = viewport.x + viewport.w / 2;
    const centerY = viewport.y + viewport.h / 2;
    
    setViewport({ x: centerX - newW/2, y: centerY - newH/2, w: newW, h: newH });
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewport({ x: 0, y: 0, w: BASE_WIDTH, h: BASE_HEIGHT });
  };

  // When focusAgentId changes from outside, select that agent AND center on them
  useEffect(() => {
    if (focusAgentId) {
      setSelectedAgentId(focusAgentId);
      
      // Also pan to the agent
      const positions = computeAllPositions(state.agents); // Recompute locally or use memo
      const pos = positions.get(focusAgentId);
      if (pos) {
        // Center the view on this agent
        // Preserve current zoom level (width/height)
        setViewport(prev => ({
          ...prev,
          x: pos.x - prev.w / 2,
          y: pos.y - prev.h / 2
        }));
      }
    }
  }, [focusAgentId, state.agents]);

  // Crowded scene: dim non-hovered agents when 5+ agents present
  const isCrowded = state.agents.length >= 5;

  // Precompute positions for all agents (solo + team modes)
  const allPositions = useMemo(() => computeAllPositions(state.agents), [state.agents]);

  // Compute branch lanes for the ground area
  const branchLanes = useMemo(() => computeBranchLanes(state.agents), [state.agents]);

  // Compute branch grouping zones (background enclosures)
  const branchZones = useMemo(
    () => computeBranchZones(state.agents, allPositions),
    [state.agents, allPositions],
  );

  if (!state.name && state.agents.length === 0) {
    return (
      <div className={`scene-container no-team${className ? ` ${className}` : ''}`}>
        <h2>The Workshop in the Woods</h2>
        <p>Waiting for a session to start...<br />
        Launch Claude Code to begin.</p>
      </div>
    );
  }

  return (
    <div className={`scene-container${className ? ` ${className}` : ''}`} style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
      {/* Zoom Controls Overlay */}
      <div className="scene-controls">
        <button onClick={handleZoomIn} title="Zoom In">+</button>
        <button onClick={handleZoomOut} title="Zoom Out">−</button>
        <button onClick={handleResetZoom} title="Reset View">Reset</button>
      </div>

      <svg
        viewBox={`${viewport.x} ${viewport.y} ${viewport.w} ${viewport.h}`}
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ background: 'var(--color-bg)', touchAction: 'none' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Sky gradient */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="60%" stopColor="#16213e" />
            <stop offset="100%" stopColor="#0f3460" />
          </linearGradient>
        </defs>
        <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill="url(#skyGrad)" />
        {/* Note: We redraw sky rect to cover full viewport area. 
            Alternatively, use a fixed huge rect or rely on container bg.
            Re-using viewbox coords ensures it covers the visible area. */}
            
        {/* Ground - Fixed Y coordinates meant for 600h scene. 
            Background elements need to stay relative to the "world" coordinates (0,0 to 900,600).
        */}
        <rect x="-1000" y="480" width="3000" height="500" fill="#2d5a27" rx="0" />
        <rect x="-1000" y="480" width="3000" height="4" fill="#4a6741" />

        {/* Branch grouping zones — subtle background enclosures behind agents sharing a branch */}
        {branchZones.map((zone) => (
          <g key={`zone-${zone.branch}`}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx="12"
              fill={zone.color}
              opacity="0.06"
            />
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx="12"
              fill="none"
              stroke={zone.color}
              strokeWidth="1"
              strokeDasharray="4 4"
              opacity="0.15"
            />
          </g>
        ))}

        {/* Branch lanes in ground area — colored strips per unique branch */}
        {branchLanes.size > 0 && Array.from(branchLanes.entries()).map(([branch, lane]) => (
          <g key={`lane-${branch}`}>
            <rect
              x="-1000"
              y={lane.y}
              width="3000"
              height="18"
              fill={lane.color}
              opacity="0.12"
            />
            <rect
              x="-1000"
              y={lane.y}
              width="3000"
              height="1"
              fill={lane.color}
              opacity="0.2"
            />
            {/* Branch name label — fixed X position? No, should pan with world. */}
            <text
              x="8"
              y={lane.y + 12}
              fill={lane.color}
              fontSize="7"
              fontFamily="'Courier New', monospace"
              opacity="0.5"
            >
              {'\u2387 '}{branch.length > 20 ? branch.slice(0, 19) + '\u2026' : branch}
            </text>
          </g>
        ))}

        {/* Trees (background decoration) */}
        <g opacity="0.6">
          {[50, 150, 780, 860].map((tx, i) => (
            <g key={i} transform={`translate(${tx}, 440)`}>
              <rect x="-4" y="0" width="8" height="40" fill="#5a3a1a" />
              <polygon points="-20,-5 0,-40 20,-5" fill="#2d5a27" />
              <polygon points="-15,-20 0,-50 15,-20" fill="#3a7a34" />
            </g>
          ))}
        </g>

        {/* Stars */}
        {[
          [80, 40], [200, 60], [340, 30], [500, 50], [650, 35], [780, 55],
          [120, 90], [400, 80], [600, 70], [720, 45],
        ].map(([sx, sy], i) => (
          <rect key={i} x={sx} y={sy} width="2" height="2" fill="#ffffff" opacity={0.4 + (i % 3) * 0.2} />
        ))}

        {/* Machine connections between agents (team mode) */}
        {!isSoloMode && state.agents.length > 1 && <Machine agents={state.agents} messages={state.messages} positions={allPositions} />}

        {/* Subagent tether lines — energy connections from parent to subagents */}
        {subagents.length > 0 && subagents.map((sub, si) => {
          const parentId = sub.parentAgentId || '';
          const parentPos = allPositions.get(parentId) || SOLO_POSITION;
          const subPos = allPositions.get(sub.id) || SOLO_POSITION;
          const mx = (parentPos.x + subPos.x) / 2;
          const my = (parentPos.y + subPos.y) / 2 - 20;
          const d = `M ${parentPos.x} ${parentPos.y} Q ${mx} ${my} ${subPos.x} ${subPos.y}`;
          const isActive = sub.status === 'working';
          const isIdle = sub.status === 'idle';
          const color = isActive ? '#4169E1' : (sub.status === 'done' ? '#28A745' : '#334155');

          return (
            <g key={`tether-${sub.id}`} style={{
              opacity: isIdle ? 0.35 : 1,
              transition: 'opacity 0.4s ease',
            }}>
              {/* Pipe background */}
              <path d={d} fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" opacity="0.4" />
              <path d={d} fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
              {/* Animated flow line */}
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeDasharray={isActive ? '3 6' : '2 10'}
                opacity={isActive ? 0.7 : 0.3}
                style={isActive ? { animation: 'conveyor-move 0.6s linear infinite' } : undefined}
              />
              {/* Energy pulse when active */}
              {isActive && (
                <circle r="3" fill={color} opacity="0.8">
                  <animateMotion dur="1.5s" repeatCount="indefinite">
                    <mpath href={`#tether-path-${si}`} />
                  </animateMotion>
                </circle>
              )}
              <path id={`tether-path-${si}`} d={d} fill="none" stroke="none" />
            </g>
          );
        })}

        {/* Branch tether lines — vertical dashes from agent platforms to ground lanes.
            Only drawn when 2+ branches exist (single-branch = no tethers per design). */}
        {branchLanes.size >= 2 && state.agents.map((agent, i) => {
          if (!agent.gitBranch || agent.isSubagent) return null;
          const lane = branchLanes.get(agent.gitBranch);
          if (!lane) return null;
          const pos = allPositions.get(agent.id) || { x: 450, y: 300 };
          // Tether from platform bottom (agent y + 28) to lane midpoint
          const tetherTop = pos.y + 28;
          const tetherBottom = lane.y + 9;
          if (tetherBottom <= tetherTop) return null;
          return (
            <line
              key={`branch-tether-${agent.id}`}
              x1={pos.x}
              y1={tetherTop}
              x2={pos.x}
              y2={tetherBottom}
              stroke={lane.color}
              strokeWidth="1"
              strokeDasharray="2 4"
              opacity="0.2"
            />
          );
        })}

        {/* Agent characters at their stations */}
        {state.agents.map((agent, i) => {
          const pos = allPositions.get(agent.id) || { x: 450, y: 300 };
          // For subagents: translate to position, scale down, translate back.
          // This ensures scaling happens around the agent's center, not SVG origin.
          const subScale = agent.isSubagent
            ? `translate(${pos.x}, ${pos.y}) scale(0.8) translate(${-pos.x}, ${-pos.y})`
            : undefined;

          // Dim idle subagents to reduce visual clutter
          const isIdleDimmed = agent.status === 'idle' && agent.isSubagent;

          // Hover dimming: when hovering in a crowded scene, dim unrelated agents
          let agentOpacity = isIdleDimmed ? 0.45 : 1;
          if (isCrowded && hoveredAgentId) {
            const isHovered = agent.id === hoveredAgentId;
            const isRelated = agent.parentAgentId === hoveredAgentId || agent.id === (state.agents.find(a => a.id === hoveredAgentId)?.parentAgentId);
            agentOpacity = isHovered || isRelated ? 1 : 0.3;
          }

          return (
            <g key={agent.id} transform={subScale}
               onClick={(e) => { e.stopPropagation(); setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id); }}
               onMouseEnter={() => setHoveredAgentId(agent.id)}
               onMouseLeave={() => setHoveredAgentId(null)}
               style={{ cursor: 'pointer', opacity: agentOpacity, transition: 'opacity 0.2s ease' }}>
              <AgentCharacter
                agent={agent}
                x={pos.x}
                y={pos.y}
              />
              <ActionBubble agent={agent} x={pos.x} y={pos.y} />
            </g>
          );
        })}

        {/* Agent detail popover (click to expand) */}
        {selectedAgentId && (() => {
          const agent = state.agents.find((a) => a.id === selectedAgentId);
          if (!agent) return null;
          const pos = allPositions.get(agent.id) || { x: 450, y: 300 };
          return <AgentDetail agent={agent} x={pos.x} y={pos.y} onClose={() => setSelectedAgentId(null)} tasks={state.tasks} />;
        })()}
      </svg>
    </div>
  );
}
