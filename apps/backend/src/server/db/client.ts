import { verifyIfDue } from '../audit/scheduled-verification';
import { MEMORY_DB, resolveDbPath } from './config';
import { type AppDb, createDb } from './connection';

// Cached on globalThis so Next.js dev HMR re-evaluating this module reuses one connection.
const globalForDb = globalThis as typeof globalThis & { __securedeskDb?: AppDb };

function getDb(): AppDb {
  if (!globalForDb.__securedeskDb) {
    const filename = resolveDbPath();
    globalForDb.__securedeskDb = createDb(
      filename,
      filename === MEMORY_DB ? undefined : (db) => void verifyIfDue(db),
    );
  }
  return globalForDb.__securedeskDb;
}

/**
 * The shared database. It is opened on first use, not on import: `next build` imports every
 * route module, and that must work (and must not create a database file) in a CI checkout
 * that has no DATABASE_PATH. A bad configuration therefore surfaces on the first query.
 */
export const db: AppDb = new Proxy({} as AppDb, {
  get: (_target, property) => Reflect.get(getDb(), property),
});
