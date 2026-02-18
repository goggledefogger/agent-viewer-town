import type { AgentState } from '@agent-viewer/shared';
import { SOLO_POSITION } from './sceneLayout';

interface SceneBackgroundProps {
  viewport: { x: number; y: number; w: number; h: number };
  branchZones: Array<{ branch: string; x: number; y: number; width: number; height: number; color: string }>;
  branchLanes: Map<string, { y: number; color: string }>;
}

/** Static background elements: sky gradient, ground, trees, stars, branch zones and lanes */
export function SceneBackground({ viewport, branchZones, branchLanes }: SceneBackgroundProps) {
  return (
    <>
      {/* Sky gradient */}
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a1a2e" />
          <stop offset="60%" stopColor="#16213e" />
          <stop offset="100%" stopColor="#0f3460" />
        </linearGradient>
      </defs>
      <rect x={viewport.x} y={viewport.y} width={viewport.w} height={viewport.h} fill="url(#skyGrad)" />

      {/* Ground */}
      <rect x="-1000" y="480" width="3000" height="500" fill="#2d5a27" rx="0" />
      <rect x="-1000" y="480" width="3000" height="4" fill="#4a6741" />

      {/* Branch grouping zones */}
      {branchZones.map((zone) => (
        <g key={`zone-${zone.branch}`}>
          <rect
            x={zone.x} y={zone.y} width={zone.width} height={zone.height}
            rx="12" fill={zone.color} opacity="0.06"
          />
          <rect
            x={zone.x} y={zone.y} width={zone.width} height={zone.height}
            rx="12" fill="none" stroke={zone.color} strokeWidth="1" strokeDasharray="4 4" opacity="0.15"
          />
        </g>
      ))}

      {/* Branch lanes in ground area */}
      {branchLanes.size > 0 && Array.from(branchLanes.entries()).map(([branch, lane]) => (
        <g key={`lane-${branch}`}>
          <rect x="-1000" y={lane.y} width="3000" height="18" fill={lane.color} opacity="0.12" />
          <rect x="-1000" y={lane.y} width="3000" height="1" fill={lane.color} opacity="0.2" />
          <text x="8" y={lane.y + 12} fill={lane.color} fontSize="7" fontFamily="'Courier New', monospace" opacity="0.5">
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
    </>
  );
}

interface SubagentTethersProps {
  subagents: AgentState[];
  allPositions: Map<string, { x: number; y: number }>;
}

/** Energy connection lines from parent agents to their subagents */
export function SubagentTethers({ subagents, allPositions }: SubagentTethersProps) {
  if (subagents.length === 0) return null;

  return (
    <>
      {subagents.map((sub, si) => {
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
            <path d={d} fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round" opacity="0.4" />
            <path d={d} fill="none" stroke="#1e293b" strokeWidth="2" strokeLinecap="round" />
            <path
              d={d} fill="none" stroke={color} strokeWidth="1.5"
              strokeDasharray={isActive ? '3 6' : '2 10'}
              opacity={isActive ? 0.7 : 0.3}
              style={isActive ? { animation: 'conveyor-move 0.6s linear infinite' } : undefined}
            />
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
    </>
  );
}

interface BranchTethersProps {
  agents: AgentState[];
  branchLanes: Map<string, { y: number; color: string }>;
  allPositions: Map<string, { x: number; y: number }>;
}

/** Vertical dashes from agent platforms to branch ground lanes (only when 2+ branches) */
export function BranchTethers({ agents, branchLanes, allPositions }: BranchTethersProps) {
  if (branchLanes.size < 2) return null;

  return (
    <>
      {agents.map((agent) => {
        if (!agent.gitBranch || agent.isSubagent) return null;
        const lane = branchLanes.get(agent.gitBranch);
        if (!lane) return null;
        const pos = allPositions.get(agent.id) || { x: 450, y: 300 };
        const tetherTop = pos.y + 28;
        const tetherBottom = lane.y + 9;
        if (tetherBottom <= tetherTop) return null;
        return (
          <line
            key={`branch-tether-${agent.id}`}
            x1={pos.x} y1={tetherTop} x2={pos.x} y2={tetherBottom}
            stroke={lane.color} strokeWidth="1" strokeDasharray="2 4" opacity="0.2"
          />
        );
      })}
    </>
  );
}
