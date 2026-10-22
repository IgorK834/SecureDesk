import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
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

export function createDb(dbPath: string) {
  return drizzle(openConnection(dbPath), { schema });
}

export type AppDb = ReturnType<typeof createDb>;
