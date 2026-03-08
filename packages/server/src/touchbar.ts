/**
 * Touch Bar integration — updates MTMR config directly to flash red
 * when agents are waiting for input. MTMR watches items.json for changes
 * and auto-reloads, giving us live Touch Bar control from the server.
 *
 * Also writes a status JSON file for any external consumers.
 */

import { writeFile, readFile, access } from 'fs/promises';
import { constants } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';
import type { AgentState } from '@agent-viewer/shared';

const STATUS_FILE = '/tmp/agent-viewer-touchbar.json';
const MTMR_CONFIG = join(homedir(), 'Library', 'Application Support', 'MTMR', 'items.json');
const FLASH_INTERVAL_MS = 800;

/** Marker we inject into the config so we know we own it */
const AVT_MARKER = '__agent_viewer_town';

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
let flashTimer: ReturnType<typeof setInterval> | null = null;
let flashOn = false;
let currentWaitingCount = 0;
let currentWorkingCount = 0;
let currentLabel = '';
/** Stashed copy of the user's MTMR config before we took over */
let userBackupConfig: string | null = null;
/** Once we detect MTMR is unavailable, stop checking on every update */
let mtmrChecked = false;
let mtmrEnabled = false;

const FOCUS_APPLESCRIPT = `if application "Google Antigravity" is running then
  tell application "Google Antigravity" to activate
else if application "Cursor" is running then
  tell application "Cursor" to activate
else if application "iTerm" is running then
  tell application "iTerm" to activate
else if application "iTerm2" is running then
  tell application "iTerm2" to activate
else if application "Terminal" is running then
  tell application "Terminal" to activate
end if`;

function buildMtmrConfig(background: string, title: string, titleColor = '#FFFFFF'): object[] {
  return [
    {
      type: 'staticButton',
      title,
      width: 9999,
      align: 'center',
      bordered: false,
      background,
      titleColor,
      action: 'appleScript',
      actionAppleScript: { inline: FOCUS_APPLESCRIPT },
      [AVT_MARKER]: true,
    },
  ];
}

function ensureMtmrRunning(): void {
  exec('pgrep -x MTMR', (err, stdout) => {
    if (!stdout.trim()) {
      // MTMR is not running — launch it
      console.log('[touchbar] Launching MTMR...');
      exec('open -a MTMR', (launchErr) => {
        if (launchErr) {
          console.warn('[touchbar] Failed to launch MTMR:', launchErr.message);
        }
      });
    }
  });
}

async function isMtmrAvailable(): Promise<boolean> {
  try {
    await access(MTMR_CONFIG, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function writeMtmrConfig(config: object[]): Promise<void> {
  try {
    await writeFile(MTMR_CONFIG, JSON.stringify(config, null, 2) + '\n');
  } catch {
    // MTMR not available — non-critical
  }
}

async function backupUserConfig(): Promise<void> {
  if (userBackupConfig !== null) return; // already backed up
  try {
    const content = await readFile(MTMR_CONFIG, 'utf-8');
    // Don't back up our own configs
    if (!content.includes(AVT_MARKER)) {
      userBackupConfig = content;
    }
  } catch {
    // no existing config
  }
}

async function restoreUserConfig(): Promise<void> {
  if (userBackupConfig === null) return;
  try {
    await writeFile(MTMR_CONFIG, userBackupConfig);
    userBackupConfig = null;
  } catch {
    // non-critical
  }
}

function startFlashing(): void {
  if (flashTimer) return;
  flashOn = true;
  flashTimer = setInterval(async () => {
    flashOn = !flashOn;
    const bg = flashOn ? '#FF0000' : '#FFFFFF';
    const fg = flashOn ? '#FFFFFF' : '#FF0000';
    await writeMtmrConfig(buildMtmrConfig(bg, currentLabel, fg));
  }, FLASH_INTERVAL_MS);
}

function stopFlashing(): void {
  if (flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
  }
  flashOn = false;
}

/**
 * Update the Touch Bar with current waiting agents.
 * Called by StateManager whenever waiting state transitions occur.
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

  // Write status JSON for external consumers
  const json = JSON.stringify(status);
  const comparable = JSON.stringify({ ...status, timestamp: 0 });
  if (comparable !== lastWrittenJson) {
    lastWrittenJson = comparable;
    try {
      await writeFile(STATUS_FILE, json + '\n');
    } catch {
      // non-critical
    }
  }

  // Update MTMR Touch Bar if available — check once, then cache the result.
  // This makes the feature a complete no-op on machines without MTMR.
  if (!mtmrChecked) {
    mtmrChecked = true;
    mtmrEnabled = await isMtmrAvailable();
    if (mtmrEnabled) {
      console.log('[touchbar] MTMR detected — Touch Bar notifications enabled');
      // Auto-launch MTMR if installed but not running
      ensureMtmrRunning();
    }
  }
  if (!mtmrEnabled) return;

  // Count working agents (not idle, not waiting)
  let workingCount = 0;
  for (const agent of allAgents.values()) {
    if (agent.status === 'working' && !agent.waitingForInput) {
      workingCount++;
    }
  }

  const prevWaitingCount = currentWaitingCount;
  const prevWorkingCount = currentWorkingCount;
  currentWaitingCount = waiting.length;
  currentWorkingCount = workingCount;

  if (waiting.length > 0) {
    // Agents waiting for input — flash red/white
    if (waiting.length === 1) {
      currentLabel = `⚠️ ${waiting[0].name.slice(0, 12)}`;
    } else {
      currentLabel = `⚠️ ${waiting.length} waiting`;
    }

    if (prevWaitingCount === 0) {
      await backupUserConfig();
      await writeMtmrConfig(buildMtmrConfig('#FF0000', currentLabel));
      startFlashing();
    }
    // If already flashing, the label update will happen on next flash tick
  } else if (workingCount > 0) {
    // Agents actively working — no special Touch Bar state, restore user config
    stopFlashing();
    if (prevWaitingCount > 0 || prevWorkingCount === 0) {
      if (userBackupConfig !== null) {
        await restoreUserConfig();
      } else {
        await writeMtmrConfig(buildMtmrConfig('#1a1a2e', '🤖 Working...'));
      }
    }
  } else {
    // All agents idle — show solid green
    stopFlashing();
    if (prevWaitingCount > 0 || prevWorkingCount > 0) {
      await backupUserConfig();
      await writeMtmrConfig(buildMtmrConfig('#00AA00', '✅ Done — ready for input', '#FFFFFF'));
    }
  }
}

/**
 * Clear the Touch Bar status (e.g., on server shutdown).
 */
export async function clearTouchBarStatus(): Promise<void> {
  stopFlashing();
  currentWaitingCount = 0;
  lastWrittenJson = '';

  const status: TouchBarStatus = { waitingCount: 0, agents: [], timestamp: Date.now() };
  try {
    await writeFile(STATUS_FILE, JSON.stringify(status) + '\n');
  } catch {
    // non-critical
  }

  // Restore user's original Touch Bar config (only if we ever modified it)
  if (mtmrEnabled) {
    await restoreUserConfig();
  }
}
