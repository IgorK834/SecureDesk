import { closeSync, linkSync, mkdtempSync, openSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isLocalHost, validateE2eDatabase, validateTarget } from '../scripts/bot-sim/guards.ts';

describe('bot simulator target guard', () => {
  it.each(['localhost', 'api.localhost', '127.0.0.1', '::1', '[::1]'])(
    'allows the local host %s',
    (hostname) => expect(isLocalHost(hostname)).toBe(true),
  );

  it('SEC-61 refuses a non-local target unless both explicit ownership consents are present', () => {
    expect(() => validateTarget('https://example.com')).toThrow(/Refusing non-local target/);
    expect(() => validateTarget('https://example.com', { allowHost: 'example.com' })).toThrow(
      /Refusing non-local target/,
    );
    expect(() => validateTarget('https://example.com', { ownershipConfirmed: '1' })).toThrow(
      /Refusing non-local target/,
    );
    expect(
      validateTarget('https://example.com', {
        allowHost: 'example.com',
        ownershipConfirmed: '1',
      }).origin,
    ).toBe('https://example.com');
  });

  it('refuses non-HTTP targets and URLs with credentials, paths, queries or fragments', () => {
    for (const target of [
      'ftp://localhost',
      'http://user:pass@localhost',
      'http://localhost/api',
      'http://localhost/?query=1',
      'http://localhost/#fragment',
    ]) {
      expect(() => validateTarget(target)).toThrow();
    }
  });
});

describe('bot simulator database guard', () => {
  it('accepts only a file visibly dedicated to E2E', () => {
    expect(validateE2eDatabase('data/securedesk.e2e.sqlite', '/workspace')).toBe(
      '/workspace/data/securedesk.e2e.sqlite',
    );
    expect(() => validateE2eDatabase('data/securedesk.sqlite', '/workspace')).toThrow(/\.e2e\./);
    expect(() => validateE2eDatabase(':memory:', '/workspace')).toThrow(/E2E SQLite file/);
  });

  it('refuses symbolic links and a hard link to the configured development database', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'securedesk-bot-guard-'));
    const development = path.join(directory, 'securedesk.sqlite');
    closeSync(openSync(development, 'w'));
    const symbolic = path.join(directory, 'symbolic.e2e.sqlite');
    const hard = path.join(directory, 'hard.e2e.sqlite');
    symlinkSync(development, symbolic);
    linkSync(development, hard);

    expect(() => validateE2eDatabase(symbolic, directory)).toThrow(/symbolic-link/);
    expect(() => validateE2eDatabase(hard, directory, { DATABASE_PATH: development })).toThrow(
      /DATABASE_PATH/,
    );
  });
});
