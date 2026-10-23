import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Runs the real CLI in a child process: what reaches stdout, the exit code and the file mode are
// behaviour of the process. The working directory is a temp dir, so the credentials file lands
// in <tmp>/.local and never in the developer's real apps/backend/.local.
const backendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendDir, '../..');
const tsx = path.resolve(repoRoot, 'node_modules/.bin/tsx');

function run(script: 'migrate' | 'seed', env: Record<string, string>) {
  const result = spawnSync(tsx, [path.join(backendDir, 'scripts', `${script}.ts`)], {
    cwd: tmp,
    // Deliberately not inheriting process.env, so the developer's own .env cannot leak in.
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'development', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

let tmp: string;
let dbFile: string;
let credentialsFile: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-seed-'));
  dbFile = path.join(tmp, 'data', 'dev.sqlite');
  credentialsFile = path.join(tmp, '.local', 'initial-credentials.txt');
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function query<T>(sql: string, file: string = dbFile): T[] {
  const sqlite = new Database(file, { readonly: true });
  try {
    return sqlite.prepare(sql).all() as T[];
  } finally {
    sqlite.close();
  }
}

const credentialLines = () =>
  readFileSync(credentialsFile, 'utf8')
    .split('\n')
    .filter((line) => /^[A-Za-z0-9]+: \S+$/.test(line))
    .map((line) => line.split(': ') as [string, string]);

describe('db:seed', () => {
  it('seeds a migrated database and leaves the passwords only in an owner-only file', () => {
    expect(run('migrate', { DATABASE_PATH: dbFile }).status).toBe(0);

    const { status, out } = run('seed', { DATABASE_PATH: dbFile });

    expect(status).toBe(0);
    expect(out).toMatch(/created 7 account\(s\)/);
    expect(out).toContain(`.local${path.sep}initial-credentials.txt`);
    expect(query('SELECT 1 FROM users')).toHaveLength(7);

    expect(statSync(credentialsFile).mode & 0o777).toBe(0o600);
    const credentials = credentialLines();
    expect(credentials.map(([login]) => login).sort()).toEqual(
      ['ADMIN', 'employee1', 'employee2', 'guest1', 'guest2', 'manager1', 'manager2'].sort(),
    );
    for (const [, password] of credentials) {
      expect(password).toHaveLength(16);
      // Neither the passwords nor the stored hashes may ever be printed.
      expect(out).not.toContain(password);
    }
    expect(out).not.toContain('$argon2id$');
  });

  it('also creates the five demo tickets in a development database, once', () => {
    run('migrate', { DATABASE_PATH: dbFile });

    const first = run('seed', { DATABASE_PATH: dbFile });
    const second = run('seed', { DATABASE_PATH: dbFile });

    expect(first.status).toBe(0);
    expect(first.out).toMatch(/created 5 demo ticket\(s\)/);
    expect(second.out).not.toMatch(/demo ticket/);
    expect(query('SELECT 1 FROM tickets')).toHaveLength(5);
  });

  it('creates no demo tickets when NODE_ENV is production, but still seeds the accounts', () => {
    run('migrate', { DATABASE_PATH: dbFile, NODE_ENV: 'production' });

    const { status, out } = run('seed', { DATABASE_PATH: dbFile, NODE_ENV: 'production' });

    expect(status).toBe(0);
    expect(out).toMatch(/created 7 account\(s\)/);
    expect(out).not.toMatch(/demo ticket/);
    expect(query('SELECT 1 FROM tickets')).toEqual([]);
    expect(query('SELECT 1 FROM users')).toHaveLength(7);
  });

  it('on a second run creates nothing and leaves the credentials file as it was', () => {
    run('migrate', { DATABASE_PATH: dbFile });
    run('seed', { DATABASE_PATH: dbFile });
    const before = readFileSync(credentialsFile, 'utf8');
    const hashes = query('SELECT login, password_hash FROM users ORDER BY login');

    const { status, out } = run('seed', { DATABASE_PATH: dbFile });

    expect(status).toBe(0);
    expect(out).toMatch(/nothing to create/);
    expect(readFileSync(credentialsFile, 'utf8')).toBe(before);
    expect(query('SELECT login, password_hash FROM users ORDER BY login')).toEqual(hashes);
  });

  it('keeps the credentials file out of Git', () => {
    const { status } = spawnSync(
      'git',
      ['check-ignore', '-q', 'apps/backend/.local/initial-credentials.txt'],
      {
        cwd: repoRoot,
      },
    );

    expect(status).toBe(0);
  });

  it('exits non-zero with a clear message when DATABASE_PATH is missing, creating nothing', () => {
    const { status, out } = run('seed', {});

    expect(status).toBe(1);
    expect(out).toMatch(/db:seed failed: DATABASE_PATH is not set/);
    expect(existsSync(path.join(tmp, '.local'))).toBe(false);
  });

  it('exits non-zero on a database that was never migrated, writing no credentials', () => {
    const { status, out } = run('seed', { DATABASE_PATH: dbFile });

    expect(status).toBe(1);
    expect(out).toMatch(/db:seed failed: no such table/);
    expect(existsSync(credentialsFile)).toBe(false);
  });

  it('never prints a hash or the failed SQL when an insert fails', () => {
    run('migrate', { DATABASE_PATH: dbFile });
    const sqlite = new Database(dbFile);
    sqlite.exec(
      "CREATE TRIGGER block_users BEFORE INSERT ON users BEGIN SELECT RAISE(ABORT, 'insert blocked'); END;",
    );
    sqlite.close();

    const { status, out } = run('seed', { DATABASE_PATH: dbFile });

    expect(status).toBe(1);
    expect(out).toMatch(/db:seed failed: insert blocked/);
    // The failed statement carries the Argon2id hashes as parameters. Today Drizzle reports only
    // the driver message; if a Drizzle upgrade starts adding the statement or its parameters to
    // error messages, this assertion fails instead of the console leaking hashes.
    expect(out).not.toMatch(/argon2id|params|insert into|failed query/i);
    expect(query('SELECT 1 FROM users')).toHaveLength(0);
    expect(existsSync(credentialsFile)).toBe(false);
  });

  it('aborts before creating any account when the credentials file cannot be stored', () => {
    run('migrate', { DATABASE_PATH: dbFile });
    writeFileSync(path.join(tmp, '.local'), 'a file where the directory should be');

    const { status } = run('seed', { DATABASE_PATH: dbFile });

    expect(status).toBe(1);
    expect(query('SELECT 1 FROM users')).toHaveLength(0);
  });
});

describe('db:seed:test (NODE_ENV=test)', () => {
  it('seeds the test database but persists no passwords anywhere', () => {
    const testDb = path.join(tmp, 'data', 'test.sqlite');
    const env = { NODE_ENV: 'test', DATABASE_PATH: dbFile, TEST_DATABASE_PATH: testDb };
    expect(run('migrate', env).status).toBe(0);

    const { status, out } = run('seed', env);

    expect(status).toBe(0);
    expect(out).toMatch(/NODE_ENV=test\) - created 7 account\(s\)/);
    expect(out).toMatch(/not persisted/);
    expect(query('SELECT 1 FROM users', testDb)).toHaveLength(7);
    expect(query('SELECT 1 FROM tickets', testDb)).toHaveLength(5);
    expect(existsSync(path.join(tmp, '.local'))).toBe(false);
    expect(existsSync(dbFile)).toBe(false);
  });
});

describe('npm scripts', () => {
  const scripts = JSON.parse(readFileSync(path.join(backendDir, 'package.json'), 'utf8'))
    .scripts as Record<string, string>;

  it('run the seed CLI, the test variant against the test database', () => {
    expect(scripts['db:seed']).toMatch(/tsx .*scripts\/seed\.ts$/);
    expect(scripts['db:seed:test']).toMatch(/^NODE_ENV=test tsx .*scripts\/seed\.ts$/);
  });
});
