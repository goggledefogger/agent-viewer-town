import type { AgentState, TaskState } from '@agent-viewer/shared';
import { getBranchColor } from '../constants/colors';
import { relativeTime } from './RelativeTime';

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
export function AgentDetail({ agent, x, y, onClose, tasks }: { agent: AgentState; x: number; y: number; onClose: () => void; tasks?: TaskState[] }) {
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

  const currentTask = agent.currentTaskId && tasks
    ? tasks.find(t => t.id === agent.currentTaskId)
    : undefined;

  const recentActions = agent.recentActions || [];

  const lineHeight = 11;
  const headerHeight = 18;
  const hasBranch = !!agent.gitBranch;

  let contentLines = nameLines.length + actionLines.length + 1;
  if (contextLine) contentLines += 1;
  if (hasBranch) contentLines += 3;
  if (currentTask) contentLines += 2;
  if (recentActions.length > 0) contentLines += 1 + Math.min(recentActions.length, 3);
  const bodyHeight = contentLines * lineHeight + 8;
  const totalHeight = headerHeight + bodyHeight + 8;
  const boxWidth = 260;

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
