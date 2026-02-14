/**
 * File watcher orchestrator — watches ~/.claude/ for session activity.
 *
 * This is the entry point that creates shared context and delegates to
 * domain-specific watchers:
 * - teamWatcher: Team config files (config.json) + task scanning
 * - taskWatcher: Task files (*.json)
 * - transcriptWatcher: JSONL transcript files for session/subagent detection
 * - stalenessChecker: Periodic idle detection and orphan cleanup
 */

import type { StateManager } from '../state';
import { createDebouncer } from './utils';
import { TEAMS_DIR, TASKS_DIR, PROJECTS_DIR } from './types';
import type { WatcherContext } from './types';
import { startTeamWatcher } from './teamWatcher';
import { startTaskWatcher } from './taskWatcher';
import { startTranscriptWatcher } from './transcriptWatcher';
import { startStalenessChecker } from './stalenessChecker';

export function startWatcher(stateManager: StateManager) {
  // Create shared context for all sub-modules
  const ctx: WatcherContext = {
    stateManager,
    fileOffsets: new Map(),
    debouncer: createDebouncer(150),
    transcriptDebouncer: createDebouncer(100),
    registeredSessions: new Set(),
    registeredSubagents: new Set(),
    trackedSessions: new Map(),
  };

  // Start all watchers
  const teamWatcher = startTeamWatcher(ctx);
  const taskWatcher = startTaskWatcher(ctx);
  const transcriptWatcher = startTranscriptWatcher(ctx);
  const stalenessInterval = startStalenessChecker(ctx);

  console.log(`[watcher] Watching ${TEAMS_DIR}`);
  console.log(`[watcher] Watching ${TASKS_DIR}`);
  console.log(`[watcher] Watching transcripts in ${PROJECTS_DIR}`);

  return {
    close: () => {
      clearInterval(stalenessInterval);
      ctx.debouncer.clear();
      ctx.transcriptDebouncer.clear();
      teamWatcher.close();
      taskWatcher.close();
      transcriptWatcher.close();
    },
  };
}
