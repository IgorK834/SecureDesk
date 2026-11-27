import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const script = resolve(import.meta.dirname, '..', 'scripts', 'check-adr.ts');
const directories: string[] = [];

function record(status: string, date = '2026-11-27', title = '# Use PostgreSQL') {
  return `---\nstatus: ${status}\ndate: ${date}\n---\n\n${title}\n\nBody.\n`;
}

function lint(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'adr-'));
  directories.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return run(dir);
}

function run(dir: string) {
  try {
    const stdout = execFileSync(process.execPath, ['--experimental-strip-types', script], {
      env: { ...process.env, ADR_DIR: dir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: stdout };
  } catch (error) {
    const failure = error as { stderr: string };
    return { ok: false, output: failure.stderr };
  }
}

afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('ADR lint script', () => {
  it('passes when there is no ADR directory yet', () => {
    const missing = join(tmpdir(), `adr-missing-${process.pid}`);
    expect(run(missing)).toMatchObject({ ok: true });
  });

  it('accepts well-formed records, the template and a README', () => {
    const result = lint({
      '0000-template.md': '---\nstatus: proposed\ndate: YYYY-MM-DD\n---\n\n# Title\n',
      '0001-use-postgresql.md': record('accepted'),
      '0002-use-redis.md': record('"superseded by [0003](0003-use-valkey.md)"'),
      '0003-use-valkey.md': record('proposed'),
      'README.md': '# Index\n',
    });
    expect(result).toMatchObject({ ok: true });
  });

  it.each([
    ['a bad file name', { 'adr-1.md': record('accepted') }, /name must look like/],
    ['no front matter', { '0001-a.md': '# Title\n' }, /missing YAML front matter/],
    ['an unknown status', { '0001-a.md': record('maybe') }, /status must start with/],
    ['an impossible date', { '0001-a.md': record('accepted', '2026-13-45') }, /valid YYYY-MM-DD/],
    [
      'no title heading',
      { '0001-a.md': record('accepted', '2026-11-27', 'no heading') },
      /missing a "# Title"/,
    ],
    [
      'a duplicate number',
      { '0001-a.md': record('accepted'), '0001-b.md': record('accepted') },
      /number 0001 is already used/,
    ],
    [
      'a superseded record without a successor',
      { '0001-a.md': record('superseded') },
      /must link to the existing record/,
    ],
    [
      'a superseded record pointing at a missing file',
      { '0001-a.md': record('"superseded by 0009-gone.md"') },
      /must link to the existing record/,
    ],
  ])('fails for %s', (_name, files, message) => {
    const result = lint(files);
    expect(result.ok).toBe(false);
    expect(result.output).toMatch(message);
  });

  it('ignores non-Markdown files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'adr-'));
    directories.push(dir);
    mkdirSync(join(dir, 'images'));
    writeFileSync(join(dir, 'diagram.png'), 'x');
    expect(run(dir)).toMatchObject({ ok: true });
  });
});
