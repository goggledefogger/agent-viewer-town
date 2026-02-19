import { useState, useMemo, useEffect } from 'react';
import type { TeamState, AgentState } from '@agent-viewer/shared';
import { AgentCharacter } from './AgentCharacter';
import { Machine } from './Machine';
import { ActionBubble } from './ActionBubble';
import { AgentDetail } from './AgentDetail';
import { SceneBackground, SubagentTethers, BranchTethers } from './SceneBackground';
import { computeAllPositions, computeBranchLanes, computeBranchZones } from './sceneLayout';

interface SceneProps {
  state: TeamState;
  className?: string;
  focusAgentId?: string | null;
  onFocusTask?: (taskId: string) => void;
}

// --- Zoom & Pan Constants ---
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.5;
const BASE_WIDTH = 900;
const BASE_HEIGHT = 600;

const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

export function Scene({ state, className, focusAgentId, onFocusTask }: SceneProps) {
  const mainAgents = useMemo(() => state.agents.filter((a) => !a.isSubagent), [state.agents]);
  const subagents = useMemo(() => state.agents.filter((a) => a.isSubagent), [state.agents]);
  const isSoloMode = mainAgents.length <= 1;
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [hoveredAgentId, setHoveredAgentId] = useState<string | null>(null);

  // --- Zoom & Pan State ---
  const [viewport, setViewport] = useState({ x: 0, y: 0, w: BASE_WIDTH, h: BASE_HEIGHT });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomStep = 0.1;
    const direction = e.deltaY > 0 ? 1 : -1;
    const currentZoom = BASE_WIDTH / viewport.w;
    const newZoom = clamp(currentZoom - direction * zoomStep, MIN_ZOOM, MAX_ZOOM);
    const newW = BASE_WIDTH / newZoom;
    const newH = BASE_HEIGHT / newZoom;
    const centerX = viewport.x + viewport.w / 2;
    const centerY = viewport.y + viewport.h / 2;
    setViewport({ x: centerX - newW / 2, y: centerY - newH / 2, w: newW, h: newH });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const svgEl = e.currentTarget.closest('svg');
    const ratio = svgEl ? viewport.w / svgEl.clientWidth : 1;
    setViewport(prev => ({ ...prev, x: prev.x - dx * ratio, y: prev.y - dy * ratio }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  const zoomBy = (delta: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentZoom = BASE_WIDTH / viewport.w;
    const newZoom = clamp(currentZoom + delta, MIN_ZOOM, MAX_ZOOM);
    const newW = BASE_WIDTH / newZoom;
    const newH = BASE_HEIGHT / newZoom;
    const centerX = viewport.x + viewport.w / 2;
    const centerY = viewport.y + viewport.h / 2;
    setViewport({ x: centerX - newW / 2, y: centerY - newH / 2, w: newW, h: newH });
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewport({ x: 0, y: 0, w: BASE_WIDTH, h: BASE_HEIGHT });
  };

  // When focusAgentId changes, select and pan to that agent
  useEffect(() => {
    if (focusAgentId) {
      setSelectedAgentId(focusAgentId);
      const positions = computeAllPositions(state.agents);
      const pos = positions.get(focusAgentId);
      if (pos) {
        setViewport(prev => ({ ...prev, x: pos.x - prev.w / 2, y: pos.y - prev.h / 2 }));
      }
    }
  }, [focusAgentId, state.agents]);

  // Crowded scene: dim non-hovered agents when 5+ agents present
  const isCrowded = state.agents.length >= 5;

  // Precompute positions
  const allPositions = useMemo(() => computeAllPositions(state.agents), [state.agents]);
  const branchLanes = useMemo(() => computeBranchLanes(state.agents), [state.agents]);
  const branchZones = useMemo(() => computeBranchZones(state.agents, allPositions), [state.agents, allPositions]);

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
        <button onClick={(e) => zoomBy(0.2, e)} title="Zoom In">+</button>
        <button onClick={(e) => zoomBy(-0.2, e)} title="Zoom Out">{'\u2212'}</button>
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
        <SceneBackground viewport={viewport} branchZones={branchZones} branchLanes={branchLanes} />

        {/* Machine connections between agents (team mode) */}
        {!isSoloMode && state.agents.length > 1 && <Machine agents={state.agents} messages={state.messages} positions={allPositions} />}

        {/* Subagent tether lines */}
        <SubagentTethers subagents={subagents} allPositions={allPositions} />

        {/* Branch tether lines */}
        <BranchTethers agents={state.agents} branchLanes={branchLanes} allPositions={allPositions} />

        {/* Agent characters at their stations */}
        {state.agents.map((agent) => {
          const pos = allPositions.get(agent.id) || { x: 450, y: 300 };
          const subScale = agent.isSubagent
            ? `translate(${pos.x}, ${pos.y}) scale(0.8) translate(${-pos.x}, ${-pos.y})`
            : undefined;

          const isIdleDimmed = agent.status === 'idle' && agent.isSubagent;
          const isWaiting = agent.waitingForInput && agent.status !== 'idle';

          let agentOpacity = isIdleDimmed ? 0.45 : 1;
          if (isCrowded && hoveredAgentId) {
            const isHovered = agent.id === hoveredAgentId;
            const isRelated = agent.parentAgentId === hoveredAgentId || agent.id === (state.agents.find(a => a.id === hoveredAgentId)?.parentAgentId);
            agentOpacity = isHovered || isRelated || isWaiting ? 1 : 0.3;
          }

          return (
            <g key={agent.id} transform={subScale}
               onClick={(e) => { e.stopPropagation(); setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id); }}
               onMouseEnter={() => setHoveredAgentId(agent.id)}
               onMouseLeave={() => setHoveredAgentId(null)}
               style={{ cursor: 'pointer', opacity: agentOpacity, transition: 'opacity 0.2s ease' }}>
              {/* Pulsing highlight ring when agent is waiting for input — color varies by waitingType */}
              {isWaiting && (() => {
                const ringColor = agent.waitingType === 'permission' ? '#F97316'
                  : agent.waitingType === 'question' ? '#3B82F6'
                  : agent.waitingType === 'plan' ? '#8B5CF6'
                  : agent.waitingType === 'plan_approval' ? '#22C55E'
                  : '#EAB308';
                return (
                  <g>
                    <circle cx={pos.x} cy={pos.y} r="35" fill="none" stroke={ringColor} strokeWidth="2" opacity="0.4">
                      <animate attributeName="r" values="35;42;35" dur="2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.4;0.15;0.4" dur="2s" repeatCount="indefinite" />
                    </circle>
                    {/* Waiting-type icon badge */}
                    {agent.waitingType === 'permission' && (
                      <g transform={`translate(${pos.x + 28}, ${pos.y - 28})`}>
                        <circle cx="0" cy="0" r="8" fill="#F97316" opacity="0.9" />
                        {/* Lock icon */}
                        <rect x="-3.5" y="-1" width="7" height="5" rx="1" fill="white" />
                        <path d="M-2,-1 L-2,-3.5 A2,2 0 0,1 2,-3.5 L2,-1" fill="none" stroke="white" strokeWidth="1.2" />
                      </g>
                    )}
                    {agent.waitingType === 'question' && (
                      <g transform={`translate(${pos.x + 28}, ${pos.y - 28})`}>
                        <circle cx="0" cy="0" r="8" fill="#3B82F6" opacity="0.9" />
                        <text x="0" y="3.5" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="'Courier New', monospace">?</text>
                      </g>
                    )}
                    {agent.waitingType === 'plan' && (
                      <g transform={`translate(${pos.x + 28}, ${pos.y - 28})`}>
                        <circle cx="0" cy="0" r="8" fill="#8B5CF6" opacity="0.9" />
                        {/* Clipboard icon */}
                        <rect x="-3" y="-2" width="6" height="7" rx="0.5" fill="none" stroke="white" strokeWidth="1" />
                        <rect x="-1.5" y="-4" width="3" height="2.5" rx="0.5" fill="white" />
                        <line x1="-1.5" y1="1" x2="1.5" y2="1" stroke="white" strokeWidth="0.8" />
                        <line x1="-1.5" y1="3" x2="1.5" y2="3" stroke="white" strokeWidth="0.8" />
                      </g>
                    )}
                    {agent.waitingType === 'plan_approval' && (
                      <g transform={`translate(${pos.x + 28}, ${pos.y - 28})`}>
                        <circle cx="0" cy="0" r="8" fill="#22C55E" opacity="0.9" />
                        {/* Checkmark icon */}
                        <path d="M-3,0 L-1,3 L4,-3" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                );
              })()}
              <AgentCharacter agent={agent} x={pos.x} y={pos.y} />
              <ActionBubble agent={agent} x={pos.x} y={pos.y} />
            </g>
          );
        })}

        {/* Agent detail popover */}
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
