/**
 * Touch Bar integration — writes agent waiting status to a file
 * that MTMR/BTT shell script buttons can read for live updates.
 *
 * The status file at /tmp/agent-viewer-touchbar.json is updated whenever
 * the set of waiting agents changes. MTMR buttons poll this file every
 * 2 seconds for a responsive Touch Bar notification.
 */

import { writeFile } from 'fs/promises';
import type { AgentState } from '@agent-viewer/shared';

const STATUS_FILE = '/tmp/agent-viewer-touchbar.json';

export interface TouchBarStatus {
  waitingCount: number;
  agents: Array<{
    name: string;
    action: string;
    waitingType?: string;
  }>;
  timestamp: number;
}

let lastWrittenJson = '';

/**
 * Update the Touch Bar status file with current waiting agents.
 * Called by StateManager whenever waiting state transitions occur.
 * De-duplicates writes when the output hasn't changed.
 */
export async function updateTouchBarStatus(allAgents: Map<string, AgentState>): Promise<void> {
  const waiting: TouchBarStatus['agents'] = [];

  for (const agent of allAgents.values()) {
    if (agent.waitingForInput) {
      waiting.push({
        name: agent.name,
        action: agent.currentAction || 'Waiting for input',
        waitingType: agent.waitingType,
      });
    }
  }

  const status: TouchBarStatus = {
    waitingCount: waiting.length,
    agents: waiting,
    timestamp: Date.now(),
  };

  const json = JSON.stringify(status);
  // Skip write if nothing changed (except timestamp)
  const comparable = JSON.stringify({ ...status, timestamp: 0 });
  const lastComparable = lastWrittenJson;
  if (comparable === lastComparable) return;

  lastWrittenJson = comparable;

  try {
    await writeFile(STATUS_FILE, json + '\n');
  } catch {
    // /tmp write failure is non-critical
  }
}

/**
 * Clear the Touch Bar status file (e.g., on server shutdown).
 */
export async function clearTouchBarStatus(): Promise<void> {
  const status: TouchBarStatus = { waitingCount: 0, agents: [], timestamp: Date.now() };
  lastWrittenJson = '';
  try {
    await writeFile(STATUS_FILE, JSON.stringify(status) + '\n');
  } catch {
    // non-critical
  }
}
