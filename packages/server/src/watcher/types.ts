import { join } from 'path';
import { homedir } from 'os';
import type { StateManager } from '../state';

// ================================================================
// Directory paths
// ================================================================
export const CLAUDE_DIR = join(homedir(), '.claude');
export const TEAMS_DIR = join(CLAUDE_DIR, 'teams');
export const TASKS_DIR = join(CLAUDE_DIR, 'tasks');
export const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

// ================================================================
// Threshold constants
// ================================================================
/** Seconds of inactivity before marking a session idle */
export const IDLE_THRESHOLD_S = 60;
/** How often to check for stale sessions (ms) */
export const STALENESS_CHECK_INTERVAL_MS = 15_000;
/** On initial scan, skip files older than this (seconds) */
export const MAX_INITIAL_AGE_S = 86400; // 24 hours

// ================================================================
// Interfaces
// ================================================================

/** Track which JSONL files map to which sessionId */
export interface TrackedSession {
  sessionId: string;
  filePath: string;
  /** Whether this is a solo session (no teamName) */
  isSolo: boolean;
  /** Project directory slug from the file path */
  dirSlug: string;
  lastActivity: number;
  /** True for internal subagents (acompact, etc.) that shouldn't be shown as characters */
  isInternalSubagent?: boolean;
}

/** Shared mutable state passed between watcher sub-modules */
export interface WatcherContext {
  stateManager: StateManager;
  /** Byte offsets for each tracked JSONL file */
  fileOffsets: Map<string, number>;
  /** Debouncer for team/task file events */
  debouncer: Debouncer;
  /** Debouncer for transcript file events */
  transcriptDebouncer: Debouncer;
  /** Track which sessionIds have been registered to prevent race-condition double-registration */
  registeredSessions: Set<string>;
  /** Track which subagent IDs have been registered to prevent duplicate subagent detection */
  registeredSubagents: Set<string>;
  /** Map from JSONL file path to session tracking info */
  trackedSessions: Map<string, TrackedSession>;
}

export interface Debouncer {
  debounce(key: string, fn: () => void): void;
  clear(): void;
}
