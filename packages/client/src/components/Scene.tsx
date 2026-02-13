import { useState } from 'react';
import type { TeamState, AgentState } from '@agent-viewer/shared';
import { AgentCharacter } from './AgentCharacter';
import { Machine } from './Machine';

interface SceneProps {
  state: TeamState;
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

  // Check if agents have unique roles or are all the same
  const roleSet = new Set(mainAgents.map((a) => a.role));
  const allSameRole = roleSet.size <= 1 && mainAgents.length > 1;

  if (allSameRole || mainAgents.length > 5) {
    // Dynamic grid layout: spread agents evenly
    const cols = Math.min(mainAgents.length, 4);
    const rows = Math.ceil(mainAgents.length / cols);
    const xPad = 120;
    const yPad = 100;
    const xSpan = 900 - xPad * 2;
    const ySpan = 350;
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
    subs.forEach((sub, si) => {
      const offset = SUBAGENT_OFFSETS[si % SUBAGENT_OFFSETS.length];
      // Scale down offsets when there are many agents to avoid going off-screen
      const scale = mainAgents.length > 3 ? 0.5 : 1;
      positions.set(sub.id, {
        x: Math.max(60, Math.min(840, parentPos.x + offset.x * scale)),
        y: Math.max(80, Math.min(520, parentPos.y + offset.y * scale)),
      });
    });
  }

  return positions;
}

// Center position for solo agent
const SOLO_POSITION = { x: 450, y: 300 };

// Subagent positions fan out around the parent
const SUBAGENT_OFFSETS = [
  { x: 250, y: -20 },
  { x: -250, y: -20 },
  { x: 250, y: 120 },
  { x: -250, y: 120 },
  { x: 0, y: -120 },
];

function getStationPos(agent: AgentState, index: number, isSoloMode: boolean, subagentIndex: number) {
  if (agent.isSubagent && isSoloMode) {
    const offset = SUBAGENT_OFFSETS[subagentIndex % SUBAGENT_OFFSETS.length];
    return { x: SOLO_POSITION.x + offset.x, y: SOLO_POSITION.y + offset.y };
  }
  if (isSoloMode) return SOLO_POSITION;
  return STATION_POSITIONS[agent.role] || { x: 200 + index * 180, y: 250 };
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
  const text = agent.currentAction || (isWorking ? 'Working...' : (isDone ? 'Done' : ''));
  // Always show something for subagents (their name describes what they're doing)
  if (!text && !isWorking && !agent.isSubagent) return null;
  // For idle subagents with no action, show their name as context
  const displayText = text || (agent.isSubagent ? agent.name : '');

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

  const maxLen = 40;
  const display = displayText.length > maxLen ? displayText.slice(0, maxLen - 1) + '\u2026' : displayText;
  const context = agent.actionContext;
  const maxCtxLen = 35;
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
    ? `Subagent${agent.parentAgentId ? '' : ''}`
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
  let contentLines = nameLines.length + actionLines.length + 1;
  if (contextLine) contentLines += 1;
  if (currentTask) contentLines += 2; // label + task subject
  if (recentActions.length > 0) contentLines += 1 + Math.min(recentActions.length, 3); // label + entries
  const bodyHeight = contentLines * lineHeight + 8;
  const totalHeight = headerHeight + bodyHeight + 8;
  const boxWidth = 260;

  // Position: above the agent, clamped to viewport
  const popX = Math.max(boxWidth / 2 + 5, Math.min(900 - boxWidth / 2 - 5, x));
  const popY = Math.max(totalHeight + 10, y - 70);

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

export function Scene({ state }: SceneProps) {
  const mainAgents = state.agents.filter((a) => !a.isSubagent);
  const subagents = state.agents.filter((a) => a.isSubagent);
  // Solo mode: one main agent, possibly with subagents
  const isSoloMode = mainAgents.length <= 1;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Precompute positions for all agents (handles overlapping roles in team mode)
  const teamPositions = !isSoloMode ? computeTeamPositions(state.agents) : null;

  if (!state.name && state.agents.length === 0) {
    return (
      <div className="scene-container no-team">
        <h2>The Workshop in the Woods</h2>
        <p>Waiting for a session to start...<br />
        Launch Claude Code to begin.</p>
      </div>
    );
  }

  return (
    <div className="scene-container">
      <svg
        viewBox="0 0 900 600"
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ background: 'var(--color-bg)' }}
      >
        {/* Sky gradient */}
        <defs>
          <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1a2e" />
            <stop offset="60%" stopColor="#16213e" />
            <stop offset="100%" stopColor="#0f3460" />
          </linearGradient>
        </defs>
        <rect width="900" height="600" fill="url(#skyGrad)" />

        {/* Ground */}
        <rect x="0" y="480" width="900" height="120" fill="#2d5a27" rx="0" />
        <rect x="0" y="480" width="900" height="4" fill="#4a6741" />

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
        {!isSoloMode && state.agents.length > 1 && <Machine agents={state.agents} messages={state.messages} />}

        {/* Subagent tether lines — energy connections from parent to subagents */}
        {subagents.length > 0 && subagents.map((sub, si) => {
          const parentId = sub.parentAgentId || '';
          const parentPos = teamPositions?.get(parentId) || SOLO_POSITION;
          const subPos = teamPositions?.get(sub.id)
            || (() => { const o = SUBAGENT_OFFSETS[si % SUBAGENT_OFFSETS.length]; return { x: SOLO_POSITION.x + o.x, y: SOLO_POSITION.y + o.y }; })();
          const mx = (parentPos.x + subPos.x) / 2;
          const my = (parentPos.y + subPos.y) / 2 - 20;
          const d = `M ${parentPos.x} ${parentPos.y} Q ${mx} ${my} ${subPos.x} ${subPos.y}`;
          const isActive = sub.status === 'working';
          const color = isActive ? '#4169E1' : (sub.status === 'done' ? '#28A745' : '#334155');

          return (
            <g key={`tether-${sub.id}`}>
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

        {/* Agent characters at their stations */}
        {state.agents.map((agent, i) => {
          const subIdx = agent.isSubagent ? subagents.indexOf(agent) : 0;
          const pos = teamPositions?.get(agent.id) || getStationPos(agent, i, isSoloMode, subIdx);
          // For subagents: translate to position, scale down, translate back.
          // This ensures scaling happens around the agent's center, not SVG origin.
          const subScale = agent.isSubagent
            ? `translate(${pos.x}, ${pos.y}) scale(0.8) translate(${-pos.x}, ${-pos.y})`
            : undefined;
          return (
            <g key={agent.id} transform={subScale}
               onClick={(e) => { e.stopPropagation(); setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id); }}
               style={{ cursor: 'pointer' }}>
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
          const subIdx = agent.isSubagent ? subagents.indexOf(agent) : 0;
          const pos = teamPositions?.get(agent.id) || getStationPos(agent, state.agents.indexOf(agent), isSoloMode, subIdx);
          return <AgentDetail agent={agent} x={pos.x} y={pos.y} onClose={() => setSelectedAgentId(null)} tasks={state.tasks} />;
        })()}
      </svg>
    </div>
  );
}
