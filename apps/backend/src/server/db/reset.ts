import { existsSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { DbConfigError, MEMORY_DB, resolveDbPath } from './config';

/** The development database (`DATABASE_PATH`) or the test database (`TEST_DATABASE_PATH`). */
export const RESET_TARGETS = ['dev', 'test'] as const;
export type ResetTarget = (typeof RESET_TARGETS)[number];

const sqliteFiles = (filename: string) => [filename, `${filename}-wal`, `${filename}-shm`];

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

  const dbPath = resolveDbPath(env, target === 'test' ? 'TEST_DATABASE_PATH' : 'DATABASE_PATH');
  if (dbPath === MEMORY_DB) return [];

  const files = sqliteFiles(dbPath);
  const e2e = env.E2E_DATABASE_PATH?.trim();
  if (e2e && e2e !== MEMORY_DB) {
    // Check every file before removing anything. File identity also catches aliases through symlinks.
    const identity = (file: string) => statSync(file, { bigint: true, throwIfNoEntry: false });
    const protectedFiles = sqliteFiles(path.resolve(e2e)).map(identity);
    const overlap = files
      .map(identity)
      .some(
        (file) =>
          file &&
          protectedFiles.some(
            (protectedFile) => protectedFile?.dev === file.dev && protectedFile.ino === file.ino,
          ),
      );
    if (overlap) throw new DbConfigError('The reset target overlaps files for E2E_DATABASE_PATH.');
  }

  const removed: string[] = [];
  for (const file of files) {
    if (existsSync(file)) {
      rmSync(file);
      removed.push(file);
    }
  }
  return removed;
}
