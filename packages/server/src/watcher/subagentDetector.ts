import { basename } from 'path';
import { stat as fsStat } from 'fs/promises';
import { parseTranscriptLine } from '../parser';
import { IDLE_THRESHOLD_S } from './types';
import type { WatcherContext, TrackedSession } from './types';
import type { StateManager } from '../state';

export interface SubagentDetectionParams {
  filePath: string;
  parentSessionId: string;
  subagentId: string;
  dirSlug: string;
  lines: string[];
  linesToScan: string[];
  isInitial: boolean;
  stateManager: StateManager;
  trackedSessions: Map<string, TrackedSession>;
  registeredSubagents: Set<string>;
}

/**
 * Result of subagent detection.
 * - 'handled': subagent was processed (registered or skipped), caller should return early
 * - 'skipped': subagent was skipped (old, duplicate, etc.), caller should return early
 */
export type SubagentDetectionResult = 'handled' | 'skipped';

/**
 * Detect and register a subagent from a JSONL transcript file.
 * Handles internal subagents (acompact), name/type extraction, and registration guards.
 */
export async function detectSubagent(params: SubagentDetectionParams): Promise<SubagentDetectionResult> {
  const {
    filePath,
    parentSessionId,
    subagentId,
    dirSlug,
    lines,
    linesToScan,
    isInitial,
    stateManager,
    trackedSessions,
    registeredSubagents,
  } = params;

  // Determine initial status from file mtime + tail scan
  let subagentStatus: 'working' | 'idle' = 'idle';
  let subMtime = Date.now();
  try {
    const stats = await fsStat(filePath);
    subMtime = stats.mtimeMs;
    const ageSeconds = (Date.now() - subMtime) / 1000;
    subagentStatus = ageSeconds < IDLE_THRESHOLD_S ? 'working' : 'idle';

    // Skip old subagents during initial scan — only show recently active ones
    // (within 5 minutes to catch agents that just finished)
    if (isInitial && ageSeconds > 300) return 'skipped';
  } catch { /* default to idle */ }

  // Check tail for turn_end — overrides mtime-based status
  if (subagentStatus === 'working') {
    const subTail = lines.slice(-15);
    for (let i = subTail.length - 1; i >= 0; i--) {
      const parsed = parseTranscriptLine(subTail[i]);
      if (!parsed) continue;
      if (parsed.type === 'turn_end') {
        subagentStatus = 'idle';
        break;
      }
      if (parsed.type === 'tool_call' || parsed.type === 'thinking') break;
    }
  }

  // Filter out internal subagents (acompact = conversation compaction summarizer).
  // Instead of showing them as regular subagents, trigger the compact indicator on the parent.
  // Only set compacting status if the acompact file is recent — stale files from
  // past compactions should not mark the parent as currently compacting.
  if (subagentId.startsWith('agent-acompact')) {
    const acompactAgeS = (Date.now() - subMtime) / 1000;
    if (parentSessionId && acompactAgeS < IDLE_THRESHOLD_S) {
      stateManager.updateAgentActivityById(parentSessionId, 'working', 'Compacting conversation...');
    }
    // Track the file so we can clear the compacting status when it finishes
    trackedSessions.set(filePath, {
      sessionId: subagentId,
      filePath,
      isSolo: true,
      dirSlug,
      lastActivity: subMtime,
      isInternalSubagent: true,
    });
    console.log(`[watcher] Internal subagent (acompact) detected for parent=${parentSessionId.slice(0, 8)}, showing compacting status`);
    return 'handled';
  }

  // Extract a meaningful name and subagent type from the JSONL content
  let subagentName = subagentId.slice(0, 12);
  let subagentType: string | undefined;
  for (const line of linesToScan) {
    try {
      const d = JSON.parse(line);
      // The first user message contains the Task tool's prompt
      if (d.type === 'user' && d.message?.content) {
        const content = typeof d.message.content === 'string'
          ? d.message.content
          : '';
        if (content) {
          // Take the first line or first 40 chars as the name
          const firstLine = content.split('\n')[0].trim();
          subagentName = firstLine.length > 40
            ? firstLine.slice(0, 37) + '...'
            : firstLine;
          break;
        }
      }
      // System messages may contain agent metadata with subagent_type
      if (d.type === 'system' && d.subagent_type) {
        subagentType = d.subagent_type;
      }
    } catch { /* skip */ }
  }
  // Fall back to inferring type from agent ID prefix pattern
  if (!subagentType) {
    if (subagentId.startsWith('agent-explore')) subagentType = 'Explore';
    else if (subagentId.startsWith('agent-plan')) subagentType = 'Plan';
    else if (subagentId.startsWith('agent-bash')) subagentType = 'Bash';
  }

  // Skip re-registration of recently removed subagents (prevents stale re-detection
  // after SubagentStop hook → 15s removal → Chokidar delayed file detection)
  if (stateManager.wasRecentlyRemoved(subagentId)) {
    console.log(`[watcher] Skipping recently removed subagent: ${subagentId.slice(0, 8)}`);
    return 'skipped';
  }

  // Skip if already registered (prevents duplicate detection from multiple file events)
  if (registeredSubagents.has(subagentId)) {
    return 'skipped';
  }

  // Skip if hooks already registered this subagent and it's done
  // (SubagentStop already marked it as finished — don't resurrect it)
  const existingSubagent = stateManager.getAgentById(subagentId);
  if (existingSubagent?.status === 'done') {
    console.log(`[watcher] Skipping done subagent: ${subagentId.slice(0, 8)}`);
    return 'skipped';
  }

  registeredSubagents.add(subagentId);

  // Register the subagent
  const subagent = {
    id: subagentId,
    name: subagentName,
    role: 'implementer' as const,
    status: subagentStatus,
    tasksCompleted: 0,
    isSubagent: true,
    parentAgentId: parentSessionId,
    subagentType,
  };
  stateManager.registerAgent(subagent);

  // Track for transcript changes
  trackedSessions.set(filePath, {
    sessionId: subagentId,
    filePath,
    isSolo: true,
    dirSlug,
    lastActivity: subMtime,
  });

  // Add to display if parent session is active
  const activeSession = stateManager.getState().session;
  if (activeSession && activeSession.sessionId === parentSessionId) {
    stateManager.updateAgent(subagent);
  }

  console.log(
    `[watcher] Subagent detected: ${subagentId.slice(0, 8)} parent=${parentSessionId.slice(0, 8)} name="${subagentName}" [${subagentStatus}]`
  );
  return 'handled';
}
