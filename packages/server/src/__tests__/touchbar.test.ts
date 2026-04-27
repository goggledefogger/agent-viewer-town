import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'child_process';
import { updateTouchBarStatus, clearTouchBarStatus } from '../touchbar';
import type { AgentState } from '@agent-viewer/shared';
import * as fsPromises from 'fs/promises';

vi.mock('child_process', () => ({
  execFile: vi.fn((file, args, options, callback) => {
    // Mock MTMR not running by default, so ensureMtmrRunning will try to open it
    if (file === 'pgrep') {
      callback(null, '');
    } else if (file === 'open') {
      callback(null, '');
    }
  }),
}));

vi.mock('fs/promises', () => ({
  access: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockRejectedValue(new Error('no file')),
}));

describe('touchbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await clearTouchBarStatus();
  });

  it('uses execFile with array arguments to prevent command injection', async () => {
    const allAgents = new Map<string, AgentState>();
    allAgents.set('agent-1', {
      name: 'agent-1',
      status: 'working',
      waitingForInput: true,
      currentAction: 'Need help',
      waitingType: 'user_prompt',
      lastActivity: Date.now(),
      taskCount: 0,
      tasksCompleted: 0
    });

    await updateTouchBarStatus(allAgents);

    // After updating with waiting agents, and MTMR check caching, ensureMtmrRunning is called
    // which should use execFile('pgrep') and execFile('open')

    expect(child_process.execFile).toHaveBeenCalledWith(
      'pgrep',
      ['-x', 'MTMR'],
      expect.objectContaining({ env: expect.objectContaining({ NoDefaultCurrentDirectoryInExePath: '1' }) }),
      expect.any(Function)
    );

    // Since our mock returns empty string for pgrep stdout, it should call open
    expect(child_process.execFile).toHaveBeenCalledWith(
      'open',
      ['-a', 'MTMR'],
      expect.objectContaining({ env: expect.objectContaining({ NoDefaultCurrentDirectoryInExePath: '1' }) }),
      expect.any(Function)
    );
  });
});
