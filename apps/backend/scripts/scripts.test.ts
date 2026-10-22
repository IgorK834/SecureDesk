import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.setConfig({ testTimeout: 30_000 });

// Runs the real CLI entry points in a child process, because "exits non-zero with a
// readable message" is behaviour of the process, not of an importable function.
const backendDir = path.resolve(__dirname, '..');
const tsx = path.resolve(backendDir, '../../node_modules/.bin/tsx');

function run(script: 'migrate' | 'reset-db', env: Record<string, string>) {
  const result = spawnSync(tsx, [path.join('scripts', `${script}.ts`)], {
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

describe.each(['migrate', 'reset-db'] as const)(
  '%s script refuses a bad configuration',
  (script) => {
    it('exits non-zero with a clear message when DATABASE_PATH is missing', () => {
      const { status, out } = run(script, {});

      expect(status).toBe(1);
      expect(out).toMatch(/DATABASE_PATH is not set/);
    });

    it('exits non-zero when the dev and test paths are identical', () => {
      const file = path.join(tmp, 'same.sqlite');

      const { status, out } = run(script, { DATABASE_PATH: file, TEST_DATABASE_PATH: file });

      expect(status).toBe(1);
      expect(out).toMatch(/must be different files/);
      expect(existsSync(file)).toBe(false);
    });

    it('exits non-zero when the path is under public/', () => {
      const file = path.join(tmp, 'public', 'db.sqlite');

      const { status, out } = run(script, { DATABASE_PATH: file });

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
    const { status, out } = run('reset-db', {
      NODE_ENV: 'production',
      DATABASE_PATH: path.join(tmp, 'x.sqlite'),
    });

    expect(status).toBe(1);
    expect(out).toMatch(/production/);
  });

  it('prints which file it removed', () => {
    const file = path.join(tmp, 'dev.sqlite');
    expect(run('migrate', { DATABASE_PATH: file }).status).toBe(0);

    const { status, out } = run('reset-db', { DATABASE_PATH: file });

    expect(status).toBe(0);
    expect(out).toContain(`removed ${file}`);
    expect(existsSync(file)).toBe(false);
  });
});
