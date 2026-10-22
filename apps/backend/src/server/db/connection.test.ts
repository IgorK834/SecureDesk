import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openConnection } from './connection';

let tmp: string;
const opened: Database.Database[] = [];

function open(dbPath: string) {
  const connection = openConnection(dbPath);
  opened.push(connection);
  return connection;
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-connection-'));
});

afterEach(() => {
  while (opened.length) opened.pop()?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('openConnection', () => {
  it('turns foreign_keys ON for every connection it creates', () => {
    const file = path.join(tmp, 'a.sqlite');
    // SQLite defaults this to OFF per connection, so each new connection must set it.
    expect(open(file).pragma('foreign_keys', { simple: true })).toBe(1);
    expect(open(file).pragma('foreign_keys', { simple: true })).toBe(1);
    expect(open(':memory:').pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('enables foreign keys explicitly instead of relying on how better-sqlite3 was built', () => {
    // better-sqlite3 currently compiles SQLite with foreign keys ON by default, which would
    // hide a missing pragma; stock SQLite defaults to OFF, so the call must stay explicit.
    const pragma = vi.spyOn(Database.prototype, 'pragma');

    open(':memory:');

    expect(pragma).toHaveBeenCalledWith('foreign_keys = ON');
    pragma.mockRestore();
  });

  it('uses WAL and a 5s busy timeout on file databases', () => {
    const connection = open(path.join(tmp, 'b.sqlite'));

    expect(connection.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(connection.pragma('busy_timeout', { simple: true })).toBe(5000);
  });

  it('creates a missing parent directory such as data/', () => {
    const file = path.join(tmp, 'nested', 'data', 'c.sqlite');

    open(file).exec('CREATE TABLE t (id integer)');

    expect(open(file).prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 0 });
  });

  it('actually rejects rows that break a foreign key', () => {
    const connection = open(':memory:');
    connection.exec(`
      CREATE TABLE p (id integer PRIMARY KEY);
      CREATE TABLE c (id integer PRIMARY KEY, p_id integer REFERENCES p(id));
    `);

    expect(() => connection.prepare('INSERT INTO c (p_id) VALUES (42)').run()).toThrow(
      /FOREIGN KEY/,
    );
  });
});
