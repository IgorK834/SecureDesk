import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openConnection } from './connection';
import { ConflictError, ReferenceError, mapDbError } from './errors';
import { children, parents } from './__fixtures__/schema';

const schema = { parents, children };
let sqlite: ReturnType<typeof openConnection>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = openConnection(':memory:');
  sqlite.exec(`
    CREATE TABLE fixture_parents (id integer PRIMARY KEY AUTOINCREMENT, name text NOT NULL UNIQUE);
    CREATE TABLE fixture_children (
      id integer PRIMARY KEY AUTOINCREMENT,
      parent_id integer NOT NULL REFERENCES fixture_parents(id),
      label text NOT NULL
    );
    CREATE TABLE fixture_links (a integer NOT NULL, b integer NOT NULL, PRIMARY KEY (a, b));
  `);
  db = drizzle(sqlite, { schema });
});

afterEach(() => sqlite.close());

function capture(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the statement to fail');
}

describe('mapDbError with real Drizzle errors', () => {
  it('maps a unique violation to ConflictError', () => {
    db.insert(parents).values({ name: 'dup' }).run();
    const raw = capture(() => db.insert(parents).values({ name: 'dup' }).run());

    expect(mapDbError(raw)).toBeInstanceOf(ConflictError);
  });

  it('maps a duplicate composite primary key (join-table row added twice) to ConflictError', () => {
    db.run(sql`INSERT INTO fixture_links (a, b) VALUES (1, 2)`);
    const raw = capture(() => db.run(sql`INSERT INTO fixture_links (a, b) VALUES (1, 2)`));
    expect((raw as { cause?: { code?: string } }).cause?.code).toBe('SQLITE_CONSTRAINT_PRIMARYKEY');

    expect(mapDbError(raw)).toBeInstanceOf(ConflictError);
  });

  it('maps a foreign key violation to ReferenceError (enforced by the database itself)', () => {
    const raw = capture(() => db.insert(children).values({ parentId: 999, label: 'x' }).run());

    expect(mapDbError(raw)).toBeInstanceOf(ReferenceError);
  });

  it('maps the wrapped error Drizzle throws for raw SQL, where the code is only on `cause`', () => {
    db.run(sql`INSERT INTO fixture_parents (name) VALUES ('dup')`);
    const raw = capture(() => db.run(sql`INSERT INTO fixture_parents (name) VALUES ('dup')`));
    // Why unwrapping matters: the top-level error has no code, only the cause does.
    expect((raw as { code?: string }).code).toBeUndefined();
    expect((raw as { cause?: { code?: string } }).cause?.code).toBe('SQLITE_CONSTRAINT_UNIQUE');

    expect(mapDbError(raw)).toBeInstanceOf(ConflictError);
  });

  it.each([
    [
      'query builder (bare driver error: message names table and column)',
      () => db.insert(parents).values({ name: 'secret-value' }).run(),
      /fixture_parents\.name/,
    ],
    [
      'raw SQL (Drizzle wrapper: message contains the statement)',
      () => db.run(sql`INSERT INTO fixture_parents (name) VALUES ('secret-value')`),
      /INSERT INTO/,
    ],
  ])('exposes no SQL, names or driver text on the mapped error: %s', (_label, insert, leak) => {
    insert();
    const raw = capture(insert);
    // Precondition: the unmapped error really does leak, which is what mapping must prevent.
    expect(String((raw as Error).message)).toMatch(leak);

    const mapped = mapDbError(raw) as Error;

    const everything = [mapped.message, mapped.name, JSON.stringify(mapped), mapped.stack].join(
      '\n',
    );
    expect(everything).not.toMatch(/insert|select|fixture_|sqlite|secret-value|constraint/i);
    expect(mapped.cause).toBeUndefined();
  });
});

describe('mapDbError edge cases', () => {
  it('also recognises a bare driver error (code on the error itself)', () => {
    const driverError = Object.assign(new Error('UNIQUE constraint failed: users.email'), {
      code: 'SQLITE_CONSTRAINT_UNIQUE',
    });

    expect(mapDbError(driverError)).toBeInstanceOf(ConflictError);
  });

  it('returns unrecognised errors unchanged instead of disguising them', () => {
    const other = Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' });

    expect(mapDbError(other)).toBe(other);
    expect(mapDbError('plain string')).toBe('plain string');
    expect(mapDbError(null)).toBeNull();
  });

  it('terminates on a cyclic cause chain', () => {
    const loop = new Error('loop');
    loop.cause = loop;

    expect(mapDbError(loop)).toBe(loop);
  });
});
