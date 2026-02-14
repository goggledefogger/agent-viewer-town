import chokidar from 'chokidar';
import { basename } from 'path';
import { parseTaskFile } from '../parser';
import { isReadable } from './utils';
import { TASKS_DIR } from './types';
import type { WatcherContext } from './types';

export function startTaskWatcher(ctx: WatcherContext) {
  const { stateManager, debouncer } = ctx;

  const taskWatcher = chokidar.watch(TASKS_DIR, {
    ignoreInitial: false,
    persistent: true,
    depth: 1,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    ignored: (path: string, stats?: { isDirectory(): boolean }) => {
      if (stats?.isDirectory()) return false;
      return !path.endsWith('.json');
    },
  });

  taskWatcher.on('ready', () => {
    console.log('[watcher] Task watcher ready');
  });
  taskWatcher.on('add', (fp: string) => {
    debouncer.debounce(`task:${fp}`, () => handleTaskFile(fp));
  });
  taskWatcher.on('change', (fp: string) => {
    debouncer.debounce(`task:${fp}`, () => handleTaskFile(fp));
  });
  taskWatcher.on('unlink', (fp: string) => {
    const taskId = basename(fp).replace('.json', '');
    console.log(`[watcher] Task file removed: ${fp} (id: ${taskId})`);
    stateManager.removeTask(taskId);
    stateManager.reconcileAgentStatuses();
  });
  taskWatcher.on('error', (err: unknown) => {
    console.warn('[watcher] Task watcher error:', err instanceof Error ? err.message : err);
  });

  async function handleTaskFile(filePath: string) {
    if (basename(filePath) === 'config.json') return;
    if (!(await isReadable(filePath))) return;

    const task = await parseTaskFile(filePath);
    if (!task) return;

    stateManager.updateTask(task);
    stateManager.reconcileAgentStatuses();
  }

  return taskWatcher;
}
