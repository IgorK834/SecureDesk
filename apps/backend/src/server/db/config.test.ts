import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DbConfigError, MEMORY_DB, resolveDbPath } from './config';

const base = { NODE_ENV: 'development' } as const;

describe('resolveDbPath: which file is used', () => {
  it('uses DATABASE_PATH outside tests and resolves it to an absolute path', () => {
    const resolved = resolveDbPath({ ...base, DATABASE_PATH: './data/dev.sqlite' });
    expect(resolved).toBe(path.resolve('./data/dev.sqlite'));
    expect(path.isAbsolute(resolved)).toBe(true);
  });

  it('uses TEST_DATABASE_PATH when NODE_ENV=test so tests can never open the dev file', () => {
    const resolved = resolveDbPath({
      NODE_ENV: 'test',
      DATABASE_PATH: '/srv/data/dev.sqlite',
      TEST_DATABASE_PATH: '/srv/data/test.sqlite',
    });
    expect(resolved).toBe(path.resolve('/srv/data/test.sqlite'));
  });

  it('does not need DATABASE_PATH to be set in test mode', () => {
    expect(resolveDbPath({ NODE_ENV: 'test', TEST_DATABASE_PATH: '/srv/data/test.sqlite' })).toBe(
      path.resolve('/srv/data/test.sqlite'),
    );
  });
});

describe('resolveDbPath: fails fast on unsafe configuration', () => {
  it('rejects a missing variable and names it', () => {
    expect(() => resolveDbPath({ ...base })).toThrow(DbConfigError);
    expect(() => resolveDbPath({ ...base })).toThrow(/DATABASE_PATH is not set/);
    expect(() => resolveDbPath({ NODE_ENV: 'test' })).toThrow(/TEST_DATABASE_PATH is not set/);
  });

  it('treats a blank value as missing', () => {
    expect(() => resolveDbPath({ ...base, DATABASE_PATH: '   ' })).toThrow(/not set/);
  });

  it('rejects dev and test pointing at the same file, however the path is spelled', () => {
    const env = {
      DATABASE_PATH: './data/same.sqlite',
      TEST_DATABASE_PATH: 'data/../data/same.sqlite',
    };
    expect(() => resolveDbPath({ ...env, NODE_ENV: 'development' })).toThrow(/must be different/);
    expect(() => resolveDbPath({ ...env, NODE_ENV: 'test' })).toThrow(/must be different/);
  });

  it('rejects :memory: outside tests but allows it in tests', () => {
    expect(() => resolveDbPath({ ...base, DATABASE_PATH: MEMORY_DB })).toThrow(/NODE_ENV=test/);
    expect(() => resolveDbPath({ NODE_ENV: 'production', DATABASE_PATH: MEMORY_DB })).toThrow(
      DbConfigError,
    );
    expect(resolveDbPath({ NODE_ENV: 'test', TEST_DATABASE_PATH: MEMORY_DB })).toBe(MEMORY_DB);
  });

  it('does not treat two :memory: databases as the same file', () => {
    expect(
      resolveDbPath({ NODE_ENV: 'test', DATABASE_PATH: MEMORY_DB, TEST_DATABASE_PATH: MEMORY_DB }),
    ).toBe(MEMORY_DB);
  });

  it.each([
    '/srv/app/public/securedesk.sqlite',
    '/srv/app/apps/backend/public/data/securedesk.sqlite',
    '/srv/app/apps/frontend/src/securedesk.sqlite',
    '/srv/app/apps/frontend/data/securedesk.sqlite',
  ])('rejects a path that a web server could serve: %s', (databasePath) => {
    expect(() => resolveDbPath({ ...base, DATABASE_PATH: databasePath })).toThrow(DbConfigError);
  });

  it('applies the static-directory rule to the test path as well', () => {
    expect(() =>
      resolveDbPath({ NODE_ENV: 'test', TEST_DATABASE_PATH: '/srv/app/public/test.sqlite' }),
    ).toThrow(/public\//);
  });

  it('does not reject directories that merely contain the words', () => {
    expect(() =>
      resolveDbPath({ ...base, DATABASE_PATH: '/srv/publicity/frontend/apps/data/dev.sqlite' }),
    ).not.toThrow();
  });
});
