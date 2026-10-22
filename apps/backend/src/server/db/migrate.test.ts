import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnection } from './connection';
import { runMigrations } from './migrate';

const FIXTURE_MIGRATIONS = path.join(__dirname, '__fixtures__', 'migrations');

let tmp: string;
let dbFile: string;
const opened: ReturnType<typeof openConnection>[] = [];

/** A fresh connection, like a process (re)start would create. */
function connect() {
  const sqlite = openConnection(dbFile);
  opened.push(sqlite);
  return drizzle(sqlite);
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-migrate-'));
  dbFile = path.join(tmp, 'data', 'test.sqlite');
});

afterEach(() => {
  while (opened.length) opened.pop()?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('runMigrations on an empty database', () => {
  it('creates every table, index and foreign key the migrations define', () => {
    const db = connect();

    runMigrations(db, FIXTURE_MIGRATIONS);

    const names = (type: string) =>
      db.$client
        .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'")
        .all(type)
        .map((row) => (row as { name: string }).name);
    expect(names('table')).toEqual(
      expect.arrayContaining(['fixture_parents', 'fixture_children', '__drizzle_migrations']),
    );
    expect(names('index')).toContain('fixture_parents_name_unique');
    expect(db.$client.pragma('foreign_key_list(fixture_children)')).toHaveLength(1);
    expect(db.$client.pragma('foreign_key_check')).toEqual([]);
  });

  it('runs the real (currently empty) migrations folder without error', () => {
    expect(() => runMigrations(connect())).not.toThrow();
  });
});

describe('runMigrations on a database that already has data', () => {
  it('keeps previously inserted rows when migrating again after a restart', () => {
    runMigrations(connect(), FIXTURE_MIGRATIONS);
    connect().$client.prepare("INSERT INTO fixture_parents (name) VALUES ('keep-me')").run();
    opened.pop()?.close();

    const afterRestart = connect();
    runMigrations(afterRestart, FIXTURE_MIGRATIONS);
    runMigrations(afterRestart, FIXTURE_MIGRATIONS);

    expect(afterRestart.$client.prepare('SELECT name FROM fixture_parents').all()).toEqual([
      { name: 'keep-me' },
    ]);
    // Applied migrations are recorded once, never replayed.
    expect(
      afterRestart.$client.prepare('SELECT count(*) AS n FROM __drizzle_migrations').get(),
    ).toEqual({ n: 1 });
  });
});

describe('runMigrations integrity check', () => {
  it('fails when existing data violates a foreign key, naming the table but no row data', () => {
    const db = connect();
    runMigrations(db, FIXTURE_MIGRATIONS);
    db.$client.pragma('foreign_keys = OFF');
    db.$client
      .prepare("INSERT INTO fixture_children (parent_id, label) VALUES (999, 'orphan-secret')")
      .run();

    const failure = (() => {
      try {
        runMigrations(db, FIXTURE_MIGRATIONS);
      } catch (error) {
        return error as Error;
      }
    })();

    expect(failure?.message).toMatch(/foreign_key_check.*fixture_children/);
    expect(failure?.message).not.toMatch(/orphan-secret/);
  });
});
