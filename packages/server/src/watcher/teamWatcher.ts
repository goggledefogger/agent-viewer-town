import chokidar from 'chokidar';
import { basename, dirname, join } from 'path';
import { readdir, stat as fsStat } from 'fs/promises';
import {
  parseTeamConfig,
  parseTaskFile,
  teamMemberToAgent,
} from '../parser';
import { isReadable, isNodeError } from './utils';
import { TEAMS_DIR, TASKS_DIR, SESSION_EXPIRY_S } from './types';
import type { WatcherContext } from './types';

export function startTeamWatcher(ctx: WatcherContext) {
  const { stateManager, debouncer } = ctx;

  const teamWatcher = chokidar.watch(TEAMS_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 2,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  teamWatcher.on('ready', () => {
    console.log('[watcher] Team watcher ready');
  });
  teamWatcher.on('add', (fp: string) => {
    if (basename(fp) !== 'config.json') return;
    debouncer.debounce(`team:${fp}`, () => handleTeamConfig(fp));
  });
  teamWatcher.on('change', (fp: string) => {
    if (basename(fp) !== 'config.json') return;
    debouncer.debounce(`team:${fp}`, () => handleTeamConfig(fp));
  });
  teamWatcher.on('unlink', (fp: string) => {
    if (basename(fp) !== 'config.json') return;
    const teamName = basename(dirname(fp));
    console.log(`[watcher] Team config removed: ${fp} (team: ${teamName})`);
    // Only reset team-related state, not solo sessions
    stateManager.clearTeamAgents();
    stateManager.removeSession(`team:${teamName}`);
  });
  teamWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Team watcher error:', err instanceof Error ? err.message : err);
  });

  async function handleTeamConfig(filePath: string) {
    if (!(await isReadable(filePath))) return;

    // Check file age — skip stale configs from old teams that were never cleaned up.
    // Only process configs modified within SESSION_EXPIRY_S (1 hour).
    let fileMtimeMs: number;
    try {
      const stats = await fsStat(filePath);
      fileMtimeMs = stats.mtimeMs;
      const ageSeconds = (Date.now() - fileMtimeMs) / 1000;
      if (ageSeconds > SESSION_EXPIRY_S) {
        console.log(`[watcher] Skipping stale team config: ${filePath} (${Math.round(ageSeconds / 3600)}h old)`);
        return;
      }
    } catch {
      return;
    }

    const config = await parseTeamConfig(filePath);
    if (!config) return;

    const teamName = basename(dirname(filePath));

    // Register team agents in the allAgents registry (don't use setAgents which
    // replaces state.agents globally — that would override the active session's display).
    for (const member of config.members) {
      const agent = { ...teamMemberToAgent(member), teamName };
      stateManager.registerAgent(agent);
    }

    // Create a session entry for the team so it appears in the session picker
    // and per-client WebSocket filtering works correctly.
    // Use team: prefix to prevent collision with JSONL session UUIDs.
    const teamSessionId = `team:${teamName}`;
    if (!stateManager.getSessions().has(teamSessionId)) {
      stateManager.addSession({
        sessionId: teamSessionId,
        slug: teamName,
        projectPath: '',
        projectName: teamName,
        isTeam: true,
        teamName,
        lastActivity: fileMtimeMs,
      });
      console.log(`[watcher] Team session created: ${teamSessionId}`);
    } else {
      stateManager.updateSessionActivity(teamSessionId);
    }

    await scanTasks(teamName);
  }

  async function scanTasks(teamName: string) {
    const taskDir = join(TASKS_DIR, teamName);
    try {
      const files = await readdir(taskDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'config.json') {
          await handleTaskFile(join(taskDir, file));
        }
      }
    } catch (err) {
      if (isNodeError(err) && err.code !== 'ENOENT') {
        console.warn(`[watcher] Error scanning tasks in ${taskDir}:`, err.message);
      }
    }
  }

  async function handleTaskFile(filePath: string) {
    if (basename(filePath) === 'config.json') return;
    if (!(await isReadable(filePath))) return;

    const task = await parseTaskFile(filePath);
    if (!task) return;

    stateManager.updateTask(task);
    stateManager.reconcileAgentStatuses();
  }

  return teamWatcher;
}
