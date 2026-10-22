// For tests that drive code which uses the shared `db` (route handlers, guards). Excluded from
// coverage (see __fixtures__).
import { afterEach, beforeEach, vi } from 'vitest';
import { db } from '../client';
import { runMigrations } from '../migrate';

const globalForDb = globalThis as typeof globalThis & { __securedeskDb?: unknown };

/**
 * Gives every test in the calling file its own empty, migrated, in-memory shared database. The
 * shared `db` opens lazily, so pointing it at memory and dropping the cached connection is
 * enough. (Rows cannot simply be deleted between tests: the database itself refuses to delete
 * the ADMIN account.)
 */
export function setUpSharedTestDb(): void {
  beforeEach(() => {
    vi.stubEnv('TEST_DATABASE_PATH', ':memory:');
    delete globalForDb.__securedeskDb;
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
    delete globalForDb.__securedeskDb;
    vi.unstubAllEnvs();
  });
}
