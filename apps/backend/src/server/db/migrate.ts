import path from 'node:path';
import type Database from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

export const MIGRATIONS_FOLDER = path.join(__dirname, 'migrations');

/**
 * Applies pending migrations (append-only; already-applied ones are skipped, so existing
 * rows are kept) and then verifies referential integrity of the whole database.
 */
export function runMigrations<TSchema extends Record<string, unknown>>(
  db: BetterSQLite3Database<TSchema> & { $client: Database.Database },
  migrationsFolder: string = MIGRATIONS_FOLDER,
): void {
  migrate(db, { migrationsFolder });

  const violations = db.$client.pragma('foreign_key_check') as { table: string }[];
  if (violations.length > 0) {
    const tables = [...new Set(violations.map((row) => row.table))].join(', ');
    throw new Error(`foreign_key_check found violations in: ${tables}`);
  }
}
