import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  INITIAL_CREDENTIALS_FILE,
  appendInitialCredentials,
  prepareCredentialsDir,
} from './credentials-file';

let tmp: string;
let file: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-creds-'));
  file = path.join(tmp, '.local', 'initial-credentials.txt');
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const mode = (target: string) => statSync(target).mode & 0o777;
const issuedAt = new Date('2030-01-01T10:00:00.000Z');

describe('initial credentials file', () => {
  it('lives under the git-ignored .local directory', () => {
    expect(INITIAL_CREDENTIALS_FILE).toBe(path.join('.local', 'initial-credentials.txt'));
  });

  it('is created readable by its owner only, inside an owner-only directory', () => {
    prepareCredentialsDir(file);
    appendInitialCredentials(file, [{ login: 'manager1', password: 'pw-for-manager1' }], issuedAt);

    expect(mode(file)).toBe(0o600);
    expect(mode(path.dirname(file))).toBe(0o700);
  });

  it('lists one `login: password` line per new account, under a dated header', () => {
    prepareCredentialsDir(file);
    appendInitialCredentials(
      file,
      [
        { login: 'ADMIN', password: 'pw-admin' },
        { login: 'guest1', password: 'pw-guest1' },
      ],
      issuedAt,
    );

    const lines = readFileSync(file, 'utf8').split('\n');
    expect(lines[0]).toContain('2030-01-01T10:00:00.000Z');
    expect(lines).toContain('ADMIN: pw-admin');
    expect(lines).toContain('guest1: pw-guest1');
  });

  it('appends rather than overwrites, so earlier unchanged passwords are not lost', () => {
    prepareCredentialsDir(file);
    appendInitialCredentials(file, [{ login: 'guest1', password: 'first-run' }], issuedAt);
    appendInitialCredentials(file, [{ login: 'guest2', password: 'second-run' }], issuedAt);

    const content = readFileSync(file, 'utf8');
    expect(content).toContain('guest1: first-run');
    expect(content).toContain('guest2: second-run');
  });

  it('tightens a pre-existing file that was readable by others', () => {
    prepareCredentialsDir(file);
    writeFileSync(file, '', { mode: 0o644 });
    chmodSync(file, 0o644);

    appendInitialCredentials(file, [{ login: 'guest1', password: 'pw' }], issuedAt);

    expect(mode(file)).toBe(0o600);
  });

  it('fails when the directory cannot be created, before anything else happens', () => {
    writeFileSync(path.join(tmp, '.local'), 'a file where the directory should be');

    expect(() => prepareCredentialsDir(file)).toThrow();
  });
});
