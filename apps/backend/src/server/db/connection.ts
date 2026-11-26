import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { advanceAuditAnchor } from '../audit/anchor';
import { MEMORY_DB } from './config';
import * as schema from './schema';

/**
 * Side-effect-free connection factory. Every SecureDesk connection, however it is created,
 * goes through here so that foreign keys are always enforced by the database itself.
 */
export function openConnection(dbPath: string): Database.Database {
  if (dbPath !== MEMORY_DB) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return sqlite;
}

export function createDb(dbPath: string, afterAuditCommit?: (db: AppDb) => void) {
  const sqlite = openConnection(dbPath);
  const db = drizzle(sqlite, { schema });
  const transaction = db.transaction.bind(db);
  let active: AuditWrite | undefined;
  db.transaction = (run, config) => {
    const parent = active;
    const write = { appended: false };
    active = write;
    try {
      const result = transaction((tx) => trackAuditWrite(tx, write, run), config);
      if (write.appended) {
        if (parent) parent.appended = true;
        else if (!sqlite.inTransaction) {
          advanceAuditAnchor(db);
          afterAuditCommit?.(db);
        }
      }
      return result;
    } finally {
      active = parent;
    }
  };
  return db;
}

export type AppDb = ReturnType<typeof createDb>;

/** The `tx` handed to the callback of `db.transaction()`. */
export type AppTransaction = Parameters<Parameters<AppDb['transaction']>[0]>[0];

interface AuditWrite {
  appended: boolean;
}
const auditWrites = new WeakMap<AppTransaction, AuditWrite>();

function trackAuditWrite<T>(
  tx: AppTransaction,
  write: AuditWrite,
  run: (tx: AppTransaction) => T,
): T {
  const savepoint = tx.transaction.bind(tx);
  auditWrites.set(tx, write);
  tx.transaction = (nested) => {
    const child = { appended: false };
    const result = savepoint((inner) => trackAuditWrite(inner, child, nested));
    if (child.appended) write.appended = true;
    return result;
  };
  return run(tx);
}

export function markAuditAppended(tx: AppTransaction): void {
  const write = auditWrites.get(tx);
  if (write) write.appended = true;
}
