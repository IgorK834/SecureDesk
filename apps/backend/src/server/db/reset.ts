import { existsSync, rmSync } from 'node:fs';
import { DbConfigError, MEMORY_DB, resolveDbPath } from './config';

/** The development database (`DATABASE_PATH`) or the test database (`TEST_DATABASE_PATH`). */
export const RESET_TARGETS = ['dev', 'test'] as const;
export type ResetTarget = (typeof RESET_TARGETS)[number];

/**
 * Deletes the database file of `target` and its -wal/-shm companions, nothing else.
 * Returns the files that were actually removed.
 *
 * `env.NODE_ENV` is only looked at to refuse a production environment; it never chooses the
 * database, `target` does. The scripts pass the target as an argument for that reason: setting
 * NODE_ENV inline in the npm script would replace the caller's `production` before this guard
 * could see it.
 */
export function resetDatabase(target: ResetTarget, env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV === 'production') {
    throw new DbConfigError('Refusing to reset the database when NODE_ENV=production.');
  }

  const dbPath = resolveDbPath({ ...env, NODE_ENV: target === 'test' ? 'test' : 'development' });
  if (dbPath === MEMORY_DB) return [];

  const removed: string[] = [];
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(file)) {
      rmSync(file);
      removed.push(file);
    }
  }
  return removed;
}
