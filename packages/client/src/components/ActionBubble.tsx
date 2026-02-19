import type { AgentState } from '@agent-viewer/shared';

/** Get waiting-type specific icon and color */
function getWaitingStyle(waitingType?: 'permission' | 'question' | 'plan' | 'plan_approval') {
  switch (waitingType) {
    case 'permission':
      return { icon: '\uD83D\uDD12', label: 'Permission needed', color: '#F97316' };
    case 'question':
      return { icon: '\u2753', label: 'Question for you', color: '#3B82F6' };
    case 'plan':
      return { icon: '\uD83D\uDCCB', label: 'Plan review', color: '#8B5CF6' };
    case 'plan_approval':
      return { icon: '\u2705', label: 'Approve plan', color: '#22C55E' };
    default:
      return { icon: '\u26A0', label: 'Needs your input!', color: '#EAB308' };
  }
}

/** Prominent alert bubble when agent needs user input */
function WaitingBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  const style = getWaitingStyle(agent.waitingType);
  const label = `${style.icon} ${style.label}`;
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
        fill={style.color}
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
        stroke={style.color}
        strokeWidth="2"
        opacity="0.97"
      />
      <polygon points={`-5,${bubbleHeight - 18} 5,${bubbleHeight - 18} 0,${bubbleHeight - 13}`} fill="#1a1a2e" stroke={style.color} strokeWidth="2" />
      <rect x="-6" y={bubbleHeight - 20} width="12" height="4" fill="#1a1a2e" />
      {/* Alert text */}
      <text x="0" y="-4" textAnchor="middle" fill={style.color} fontSize="8" fontFamily="'Courier New', monospace" fontWeight="bold">
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

/** Speech bubble showing current action -- used for all agents */
export function ActionBubble({ agent, x, y }: { agent: AgentState; x: number; y: number }) {
  // Show prominent alert when waiting for user input (only if not idle)
  if (agent.waitingForInput && agent.status !== 'idle') {
    return <WaitingBubble agent={agent} x={x} y={y} />;
  }

  const isWorking = agent.status === 'working';
  const isDone = agent.status === 'done';
  const text = agent.currentAction || (isWorking ? 'Working...' : '');
  if (!text && !isWorking && !agent.isSubagent) return null;
  if (isDone && !agent.currentAction) return null;
  const displayText = text || (agent.isSubagent
    ? (agent.subagentType ? `[${agent.subagentType}] ${agent.name}` : agent.name)
    : '');

  if (isWorking && !displayText) {
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
