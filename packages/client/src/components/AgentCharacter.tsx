import { useState, useEffect, useRef } from 'react';
import type { AgentState } from '@agent-viewer/shared';
import { resolveCharacter, getEvolutionStage } from '../svg/characters';
import { STEAM_COLORS, SPARK_COLORS, CONFETTI_COLORS, getBranchColor } from '../constants/colors';
export { getBranchColor } from '../constants/colors';

interface AgentCharacterProps {
  agent: AgentState;
  x: number;
  y: number;
  isNew?: boolean;
}

/** Steam puff particles that rise and fade when agent is working */
function SteamPuffs({ active, color }: { active: boolean; color: string }) {
  if (!active) return null;

  const puffs = [
    { cx: -8, delay: 0, dur: 1.8, dx: -3, size: 3 },
    { cx: 0, delay: 0.4, dur: 2.0, dx: 1, size: 4 },
    { cx: 6, delay: 0.8, dur: 1.6, dx: 2, size: 3 },
    { cx: -4, delay: 1.2, dur: 2.2, dx: -1, size: 3.5 },
  ];

  return (
    <g transform="translate(0, -20)">
      {puffs.map((p, i) => (
        <circle
          key={i}
          cx={p.cx}
          cy={0}
          r={p.size}
          fill={STEAM_COLORS[i % STEAM_COLORS.length]}
          opacity="0"
        >
          <animate attributeName="cy" from="0" to="-22" dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.7;0.8;0" keyTimes="0;0.15;0.5;1" dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
          <animate attributeName="r" from={`${p.size * 0.5}`} to={`${p.size * 1.8}`} dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
          <animate attributeName="cx" from={`${p.cx}`} to={`${p.cx + p.dx}`} dur={`${p.dur}s`} begin={`${p.delay}s`} repeatCount="indefinite" />
        </circle>
      ))}
      <circle cx="0" cy="-8" r="2" fill={color} opacity="0">
        <animate attributeName="opacity" values="0;0.4;0" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="cy" from="-5" to="-20" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

const COMPACT_COLORS = ['#6366F1', '#8B5CF6', '#A78BFA', '#818CF8', '#7C3AED', '#6D28D9'];

/** Compacting animation: particles spiraling inward to convey data compression */
function CompactingParticles({ active }: { active: boolean }) {
  if (!active) return null;

  // 6 particles orbiting in a shrinking spiral
  const particles = [
    { angle: 0, delay: 0, dur: 3.0 },
    { angle: 60, delay: 0.5, dur: 3.0 },
    { angle: 120, delay: 1.0, dur: 3.0 },
    { angle: 180, delay: 1.5, dur: 3.0 },
    { angle: 240, delay: 2.0, dur: 3.0 },
    { angle: 300, delay: 2.5, dur: 3.0 },
  ];

  return (
    <g transform="translate(0, -8)">
      {particles.map((p, i) => {
        // Each particle starts at a wide orbit and spirals inward
        const startRad = (p.angle * Math.PI) / 180;
        const startR = 18;
        const endR = 3;
        // Start position on outer orbit
        const sx = Math.cos(startRad) * startR;
        const sy = Math.sin(startRad) * startR;
        // End position near center (rotated further)
        const endRad = startRad + Math.PI * 2.5;
        const ex = Math.cos(endRad) * endR;
        const ey = Math.sin(endRad) * endR;
        // Midpoints for spiral path
        const m1Rad = startRad + Math.PI * 0.8;
        const m1R = 14;
        const m1x = Math.cos(m1Rad) * m1R;
        const m1y = Math.sin(m1Rad) * m1R;
        const m2Rad = startRad + Math.PI * 1.6;
        const m2R = 9;
        const m2x = Math.cos(m2Rad) * m2R;
        const m2y = Math.sin(m2Rad) * m2R;

        return (
          <circle
            key={i}
            cx={sx}
            cy={sy}
            r="2.5"
            fill={COMPACT_COLORS[i % COMPACT_COLORS.length]}
            opacity="0"
          >
            <animate
              attributeName="cx"
              values={`${sx};${m1x};${m2x};${ex};${sx}`}
              keyTimes="0;0.3;0.6;0.9;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="cy"
              values={`${sy};${m1y};${m2y};${ey};${sy}`}
              keyTimes="0;0.3;0.6;0.9;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="opacity"
              values="0;0.9;0.8;0.3;0"
              keyTimes="0;0.1;0.5;0.85;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="r"
              values="2.5;2.5;2;1.5;2.5"
              keyTimes="0;0.3;0.6;0.9;1"
              dur={`${p.dur}s`}
              begin={`${p.delay}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
      {/* Central pulse — data converging */}
      <circle cx="0" cy="0" r="3" fill="#8B5CF6" opacity="0">
        <animate attributeName="r" values="2;5;2" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </g>
  );
}

/** Spark burst effect: shown briefly when a task completes */
function SparkBurst({ active }: { active: boolean }) {
  if (!active) return null;

  const sparks = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2;
    const dist = 15 + (i * 3) % 10;
    return {
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      color: SPARK_COLORS[i % SPARK_COLORS.length],
      dur: 0.5 + (i % 3) * 0.1,
    };
  });

  return (
    <g>
      {sparks.map((s, i) => (
        <rect key={i} x="-2" y="-2" width="4" height="4" fill={s.color} rx="0.5">
          <animate attributeName="x" from="-2" to={`${s.tx}`} dur={`${s.dur}s`} fill="freeze" />
          <animate attributeName="y" from="-2" to={`${s.ty}`} dur={`${s.dur}s`} fill="freeze" />
          <animate attributeName="opacity" from="1" to="0" dur={`${s.dur}s`} fill="freeze" />
          <animate attributeName="width" from="4" to="1" dur={`${s.dur}s`} fill="freeze" />
          <animate attributeName="height" from="4" to="1" dur={`${s.dur}s`} fill="freeze" />
        </rect>
      ))}
    </g>
  );
}

/** Celebration confetti when task completes (colored squares rising) */
function CelebrationParticles({ active }: { active: boolean }) {
  if (!active) return null;

  const particles = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const dist = 20 + (i * 5) % 15;
    return {
      tx: Math.cos(angle) * dist,
      ty: -Math.abs(Math.sin(angle) * dist) - 10,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      dur: 0.8 + (i % 4) * 0.15,
      delay: (i % 3) * 0.07,
      size: 2 + (i % 3),
      rotation: i * 30,
    };
  });

  return (
    <g>
      {particles.map((p, i) => (
        <rect key={i} x="-1.5" y="-1.5" width={p.size} height={p.size} fill={p.color} transform={`rotate(${p.rotation})`}>
          <animate attributeName="x" from="-1.5" to={`${p.tx}`} dur={`${p.dur}s`} begin={`${p.delay}s`} fill="freeze" />
          <animate attributeName="y" from="-1.5" to={`${p.ty}`} dur={`${p.dur}s`} begin={`${p.delay}s`} fill="freeze" />
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.6;1" dur={`${p.dur}s`} begin={`${p.delay}s`} fill="freeze" />
        </rect>
      ))}
    </g>
  );
}

export function AgentCharacter({ agent, x, y, isNew }: AgentCharacterProps) {
  const { AnimalComponent: AnimalSvg, accentColor: color } = resolveCharacter(agent);
  const stage = agent.isSubagent ? 1 : getEvolutionStage(agent.tasksCompleted);
  const isWorking = agent.status === 'working';
  const isCompacting = isWorking && !!(agent.currentAction && agent.currentAction.includes('Compacting'));

  // Track task completion for spark/celebration effect
  const prevTaskCount = useRef(agent.tasksCompleted);
  const [showSparks, setShowSparks] = useState(false);

  useEffect(() => {
    if (agent.tasksCompleted > prevTaskCount.current) {
      setShowSparks(true);
      const timer = setTimeout(() => setShowSparks(false), 1200);
      prevTaskCount.current = agent.tasksCompleted;
      return () => clearTimeout(timer);
    }
    prevTaskCount.current = agent.tasksCompleted;
  }, [agent.tasksCompleted]);

  const entranceClass = isNew ? 'agent-enter' : '';

  return (
    <g transform={`translate(${x}, ${y})`} className={entranceClass}>
      {/* Workstation platform with build-up animation */}
      <g className={isNew ? 'station-enter' : ''}>
        <rect x="-30" y="20" width="60" height="8" fill="#5a3a1a" rx="2" />
        <rect x="-26" y="16" width="52" height="8" fill="#7a5a3a" rx="2" />
      </g>

      {/* Evolution glow */}
      {stage >= 2 && (
        <circle
          cx="0" cy="0"
          r={stage >= 3 ? 28 : 22}
          fill="none" stroke={color} strokeWidth="1" opacity={0.3}
          className="agent-evolved"
        />
      )}

      {/* Animal character with idle bobbing or working state */}
      <g className={isWorking ? 'agent-working' : 'agent-idle'}>
        <AnimalSvg stage={stage} />
        {/* Eye blink overlay */}
        <g className="agent-eyes">
          <rect x="-4" y="-11" width="3" height="3" fill="transparent" />
          <rect x="2" y="-11" width="3" height="3" fill="transparent" />
        </g>
      </g>

      {/* Steam puffs when working (replaced by compacting particles during compaction) */}
      {isCompacting ? <CompactingParticles active={true} /> : <SteamPuffs active={isWorking} color={color} />}

      {/* Spark burst + celebration on task completion */}
      <SparkBurst active={showSparks} />
      <CelebrationParticles active={showSparks} />

      {/* Working gear indicator — speed scales with activity level; purple tint during compacting */}
      {isWorking && (() => {
        const gearColor = isCompacting ? '#8B5CF6' : color;
        return (
          <g transform="translate(22, -10)">
            <g style={{
              animation: `spin ${isCompacting ? '3s' : `${Math.max(0.5, 2 - agent.tasksCompleted * 0.2)}s`} linear infinite`,
              transformOrigin: '0px 0px',
            }}>
              <circle cx="0" cy="0" r="6" fill="none" stroke={gearColor} strokeWidth="1.5" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
                <rect key={angle} x="-1" y="-8" width="2" height="3" fill={gearColor} transform={`rotate(${angle})`} rx="0.5" />
              ))}
              <circle cx="0" cy="0" r="2" fill={gearColor} />
            </g>
          </g>
        );
      })()}

      {/* Done checkmark for finished subagents */}
      {agent.status === 'done' && (
        <g transform="translate(22, -10)">
          <circle cx="0" cy="0" r="7" fill="#28A745" opacity="0.9" />
          <path d="M-3,0 L-1,3 L4,-3" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      )}

      {/* Name label — subagents get longer truncation since they have descriptive names */}
      <text x="0" y="38" textAnchor="middle" fill={color} fontSize="8" fontFamily="'Courier New', monospace" fontWeight="bold"
            opacity={agent.status === 'done' ? 0.6 : 1}>
        {agent.isSubagent
          ? (agent.name.length > 19 ? agent.name.slice(0, 18) + '\u2026' : agent.name)
          : (agent.name.length > 14 ? agent.name.slice(0, 13) + '\u2026' : agent.name)}
      </text>
      {/* Status line: role | progress */}
      <text x="0" y="48" textAnchor="middle" fill="#64748b" fontSize="6.5" fontFamily="'Courier New', monospace"
            opacity={agent.status === 'done' ? 0.5 : 0.8}>
        {agent.isSubagent
          ? (agent.subagentType || 'Subagent')
          : `${agent.role.charAt(0).toUpperCase() + agent.role.slice(1)}${
              agent.currentTaskId
                ? ` | #${agent.currentTaskId}`
                : agent.tasksCompleted > 0
                  ? ` | ${agent.tasksCompleted} done`
                  : ''
            }`}
      </text>
      {/* Git branch badge pill — hidden on subagents to reduce vertical overlap */}
      {agent.gitBranch && !agent.isSubagent && (
        <g transform="translate(0, 56)">
          {(() => {
            const branchColor = getBranchColor(agent.gitBranch);
            const maxBranchLen = 16;
            const displayBranch = agent.gitBranch.length > maxBranchLen
              ? agent.gitBranch.slice(0, maxBranchLen - 1) + '\u2026'
              : agent.gitBranch;
            // Build status suffix
            const notPushed = agent.gitHasUpstream === false;
            const ahead = agent.gitAhead || 0;
            const behind = agent.gitBehind || 0;
            let statusSuffix = '';
            if (notPushed) statusSuffix = ' !';
            else if (ahead > 0 && behind > 0) statusSuffix = ` \u2191${ahead}\u2193${behind}`;
            else if (ahead > 0) statusSuffix = ` \u2191${ahead}`;
            else if (behind > 0) statusSuffix = ` \u2193${behind}`;
            const fullLabel = displayBranch + statusSuffix;
            const pillWidth = Math.max(36, fullLabel.length * 3.8 + 12);
            const isDirty = agent.gitDirty === true;
            const hasStatus = notPushed || ahead > 0 || behind > 0;
            const strokeColor = isDirty ? '#FF7043' : branchColor;
            const strokeW = isDirty ? '1' : '0.5';
            return (
              <>
                <rect
                  x={-pillWidth / 2}
                  y="-5"
                  width={pillWidth}
                  height="10"
                  rx="5"
                  fill={branchColor}
                  opacity="0.15"
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeOpacity={isDirty ? '0.7' : '0.4'}
                />
                <text
                  x="0"
                  y="2.5"
                  textAnchor="middle"
                  fill={branchColor}
                  fontSize="5.5"
                  fontFamily="'Courier New', monospace"
                  opacity={hasStatus ? '1' : '0.9'}
                >
                  {'\u2387 '}{displayBranch}
                  {statusSuffix && (
                    <tspan fill={notPushed ? '#FF7043' : '#FFCA28'}>{statusSuffix}</tspan>
                  )}
                </text>
              </>
            );
          })()}
        </g>
      )}
    </g>
  );
}
