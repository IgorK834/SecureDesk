import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ARGON2_OPTIONS } from '../src/server/auth/password-hasher';

vi.setConfig({ testTimeout: 30_000 });

const backendDir = path.resolve(__dirname, '..');
const tsx = path.resolve(backendDir, '../../node_modules/.bin/tsx');

function bench(...args: string[]) {
  const result = spawnSync(tsx, [path.join(backendDir, 'scripts', 'bench-argon2.ts'), ...args], {
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

// The output is pasted into the report to justify the parameters, so it must report the
// parameters that are actually configured, not a copy that could drift from the code.
describe('bench-argon2 script', () => {
  it('reports the configured parameters and the hash and verify times', () => {
    const { status, out } = bench('2');

    expect(status).toBe(0);
    expect(out).toContain(
      `m=${ARGON2_OPTIONS.memoryCost} KiB, t=${ARGON2_OPTIONS.timeCost}, p=${ARGON2_OPTIONS.parallelism}`,
    );
    expect(out).toMatch(/hashPassword\s*: median \d+\.\d ms, mean \d+\.\d ms, min/);
    expect(out).toMatch(/verifyPassword: median \d+\.\d ms/);
    expect(out).toContain('Runs: 2');
  });

  it.each(['0', '-3', '1.5', 'many'])(
    'rejects "%s" as a run count with usage and exit code 1',
    (arg) => {
      const { status, out } = bench(arg);

      expect(status).toBe(1);
      expect(out).toContain('Usage: npm run bench:argon2');
    },
  );
});
