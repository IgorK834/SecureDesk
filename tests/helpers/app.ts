import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '../../apps/backend/src/server/db/client';
import { runMigrations } from '../../apps/backend/src/server/db/migrate';
import { createApiClient } from './api-client';

const globalForDb = globalThis as typeof globalThis & { __securedeskDb?: unknown };

/** A migrated, file-backed test application that never opens the development database. */
export function createTestApp() {
  const directory = mkdtempSync(join(tmpdir(), 'securedesk-integration-'));
  const databasePath = join(directory, 'test.sqlite');
  const previousPath = process.env.TEST_DATABASE_PATH;
  process.env.TEST_DATABASE_PATH = databasePath;
  delete globalForDb.__securedeskDb;
  runMigrations(db);

  const closeConnection = () => {
    if (!globalForDb.__securedeskDb) return;
    db.$client.close();
    delete globalForDb.__securedeskDb;
  };

  return {
    client: createApiClient(),
    databasePath,
    db,
    restart() {
      closeConnection();
      // The lazy proxy opens the same persistent file on its next database operation.
      void db.$client;
    },
    cleanup() {
      closeConnection();
      if (previousPath === undefined) delete process.env.TEST_DATABASE_PATH;
      else process.env.TEST_DATABASE_PATH = previousPath;
      rmSync(directory, { recursive: true, force: true });
    },
    exists: () => existsSync(databasePath),
  };
}
