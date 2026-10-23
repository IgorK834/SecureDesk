import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Runs the real CLI entry points in a child process, because "exits non-zero with a
// readable message" is behaviour of the process, not of an importable function.
const backendDir = path.resolve(__dirname, '..');
const tsx = path.resolve(backendDir, '../../node_modules/.bin/tsx');

function run(script: 'migrate' | 'reset-db', env: Record<string, string>, args: string[] = []) {
  const result = spawnSync(tsx, [path.join('scripts', `${script}.ts`), ...args], {
    cwd: backendDir,
    // Deliberately not inheriting process.env, so the developer's own .env cannot leak in.
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'development', ...env },
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-cli-'));
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

// `reset-db` needs to be told which database to reset; `migrate` takes no argument.
const resetArgs = (script: 'migrate' | 'reset-db') => (script === 'reset-db' ? ['dev'] : []);

describe.each(['migrate', 'reset-db'] as const)(
  '%s script refuses a bad configuration',
  (script) => {
    it('exits non-zero with a clear message when DATABASE_PATH is missing', () => {
      const { status, out } = run(script, {}, resetArgs(script));

      expect(status).toBe(1);
      expect(out).toMatch(/DATABASE_PATH is not set/);
    });

    it('exits non-zero when the dev and test paths are identical', () => {
      const file = path.join(tmp, 'same.sqlite');

      const { status, out } = run(
        script,
        { DATABASE_PATH: file, TEST_DATABASE_PATH: file },
        resetArgs(script),
      );

      expect(status).toBe(1);
      expect(out).toMatch(/must be different files/);
      expect(existsSync(file)).toBe(false);
    });

    it('exits non-zero when the path is under public/', () => {
      const file = path.join(tmp, 'public', 'db.sqlite');

      const { status, out } = run(script, { DATABASE_PATH: file }, resetArgs(script));

      expect(status).toBe(1);
      expect(out).toMatch(/public\//);
      expect(existsSync(file)).toBe(false);
    });
  },
);

describe('migrate script', () => {
  it('creates the database file and exits 0 on a valid configuration', () => {
    const file = path.join(tmp, 'data', 'dev.sqlite');

    const { status, out } = run('migrate', { DATABASE_PATH: file });

    expect(out).toMatch(/db:migrate OK/);
    expect(status).toBe(0);
    expect(existsSync(file)).toBe(true);
  });
});

describe('reset-db script', () => {
  it('refuses to run when NODE_ENV=production', () => {
    const { status, out } = run(
      'reset-db',
      { NODE_ENV: 'production', DATABASE_PATH: path.join(tmp, 'x.sqlite') },
      ['dev'],
    );

    expect(status).toBe(1);
    expect(out).toMatch(/production/);
  });

  it('prints which file it removed', () => {
    const file = path.join(tmp, 'dev.sqlite');
    expect(run('migrate', { DATABASE_PATH: file }).status).toBe(0);

    const { status, out } = run('reset-db', { DATABASE_PATH: file }, ['dev']);

    expect(status).toBe(0);
    expect(out).toContain(`removed ${file}`);
    expect(existsSync(file)).toBe(false);
  });

  it.each([[[]], [['prod']]])(
    'needs a known target (dev or test) and deletes nothing without one: %j',
    (args) => {
      const file = path.join(tmp, 'dev.sqlite');
      writeFileSync(file, 'x');

      const { status, out } = run('reset-db', { DATABASE_PATH: file }, args);

      expect(status).toBe(1);
      expect(out).toMatch(/Usage: reset-db\.ts <dev\|test>/);
      expect(existsSync(file)).toBe(true);
    },
  );
});

// The npm scripts themselves are part of the contract: the inline `NODE_ENV=development` that
// `db:reset:dev` used to carry replaced a caller's NODE_ENV=production before the script's own
// production guard could look at it, so the guard never fired through the documented command.
// These tests run each script's command line exactly as `npm run` does (`sh -c`, from the
// workspace directory, with node_modules/.bin on the PATH), with the caller's environment given
// explicitly.
const repoRoot = path.resolve(backendDir, '../..');
const readScripts = (dir: string) =>
  JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts as Record<
    string,
    string
  >;
const packageScripts = readScripts(backendDir);

function runNpmScript(name: string, env: Record<string, string>) {
  const result = spawnSync(
    'sh',
    ['-c', packageScripts[name] ?? `echo "no script ${name}" >&2; exit 127`],
    {
      cwd: backendDir,
      env: {
        PATH: `${path.join(repoRoot, 'node_modules/.bin')}${path.delimiter}${process.env.PATH ?? ''}`,
        NODE_ENV: 'development',
        ...env,
      },
      encoding: 'utf8',
    },
  );
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

describe('npm run db:reset:dev / db:reset:test', () => {
  let dev: string;
  let testDb: string;
  const files = () => ({ DATABASE_PATH: dev, TEST_DATABASE_PATH: testDb });

  beforeEach(() => {
    dev = path.join(tmp, 'dev.sqlite');
    testDb = path.join(tmp, 'test.sqlite');
    writeFileSync(dev, 'x');
    writeFileSync(testDb, 'x');
  });

  it.each(['db:reset:dev', 'db:reset:test'])(
    '%s refuses when the caller runs with NODE_ENV=production, and deletes nothing',
    (name) => {
      const { status, out } = runNpmScript(name, { NODE_ENV: 'production', ...files() });

      expect(status).toBe(1);
      expect(out).toMatch(/production/);
      expect(existsSync(dev)).toBe(true);
      expect(existsSync(testDb)).toBe(true);
    },
  );

  it('db:reset:dev removes the development database and leaves the test one', () => {
    const { status, out } = runNpmScript('db:reset:dev', { NODE_ENV: 'development', ...files() });

    expect(status).toBe(0);
    expect(out).toContain(`removed ${dev}`);
    expect(existsSync(dev)).toBe(false);
    expect(existsSync(testDb)).toBe(true);
  });

  it('db:reset:test removes the test database and leaves the development one', () => {
    const { status, out } = runNpmScript('db:reset:test', { NODE_ENV: 'development', ...files() });

    expect(status).toBe(0);
    expect(out).toContain(`removed ${testDb}`);
    expect(existsSync(testDb)).toBe(false);
    expect(existsSync(dev)).toBe(true);
  });
});

describe('the test database can be built from nothing with npm scripts', () => {
  it('db:reset:test, db:migrate:test and db:seed:test work in that order, never touching the dev file', () => {
    const dev = path.join(tmp, 'dev.sqlite');
    const testDb = path.join(tmp, 'data', 'test.sqlite');
    const env = { DATABASE_PATH: dev, TEST_DATABASE_PATH: testDb };

    for (const name of ['db:reset:test', 'db:migrate:test', 'db:seed:test']) {
      const { status, out } = runNpmScript(name, env);
      expect({ name, status, out: status === 0 ? '' : out }).toEqual({ name, status: 0, out: '' });
    }

    expect(existsSync(testDb)).toBe(true);
    expect(existsSync(dev)).toBe(false);
  });

  it('the root package.json offers the same scripts', () => {
    const root = readScripts(repoRoot);

    expect(root['db:migrate:test']).toBe('npm run db:migrate:test -w apps/backend');
    expect(root['db:reset:test']).toBe('npm run db:reset:test -w apps/backend');
  });
});
