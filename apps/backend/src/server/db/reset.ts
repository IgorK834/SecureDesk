import { existsSync, rmSync } from 'node:fs';
import { DbConfigError, MEMORY_DB, resolveDbPath } from './config';

/**
 * Deletes the resolved database file and its -wal/-shm companions, nothing else.
 * Returns the files that were actually removed.
 */
export function resetDatabase(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV === 'production') {
    throw new DbConfigError('Refusing to reset the database when NODE_ENV=production.');
  }

  const dbPath = resolveDbPath(env);
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
