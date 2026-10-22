import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbConfigError } from './config';
import { resetDatabase } from './reset';

let tmp: string;
let dev: string;
let test: string;

function touch(...files: string[]) {
  for (const file of files) writeFileSync(file, 'x');
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'securedesk-reset-'));
  dev = path.join(tmp, 'dev.sqlite');
  test = path.join(tmp, 'test.sqlite');
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

describe('resetDatabase', () => {
  it('removes the resolved file and its -wal/-shm companions and reports them', () => {
    touch(dev, `${dev}-wal`, `${dev}-shm`);

    const removed = resetDatabase({ NODE_ENV: 'development', DATABASE_PATH: dev });

    expect(removed).toEqual([dev, `${dev}-wal`, `${dev}-shm`]);
    expect([dev, `${dev}-wal`, `${dev}-shm`].some(existsSync)).toBe(false);
  });

  it('deletes only the resolved file, never siblings in the same directory', () => {
    const sibling = path.join(tmp, 'other.sqlite');
    touch(dev, sibling);

    resetDatabase({ NODE_ENV: 'development', DATABASE_PATH: dev });

    expect(existsSync(sibling)).toBe(true);
  });

  it('resetting the test database leaves the development database untouched', () => {
    touch(dev, test);

    const removed = resetDatabase({
      NODE_ENV: 'test',
      DATABASE_PATH: dev,
      TEST_DATABASE_PATH: test,
    });

    expect(removed).toEqual([test]);
    expect(existsSync(dev)).toBe(true);
  });

  it('refuses to run in production and deletes nothing', () => {
    touch(dev);

    expect(() => resetDatabase({ NODE_ENV: 'production', DATABASE_PATH: dev })).toThrow(
      /production/,
    );
    expect(existsSync(dev)).toBe(true);
  });

  it('does not delete anything when the configuration is unsafe', () => {
    const publicDir = path.join(tmp, 'public');
    const file = path.join(publicDir, 'db.sqlite');
    mkdirSync(publicDir);
    touch(file);

    expect(() => resetDatabase({ NODE_ENV: 'development', DATABASE_PATH: file })).toThrow(
      DbConfigError,
    );
    expect(existsSync(file)).toBe(true);
  });

  it('reports nothing to do when no files exist or the database is in memory', () => {
    expect(resetDatabase({ NODE_ENV: 'development', DATABASE_PATH: dev })).toEqual([]);
    expect(resetDatabase({ NODE_ENV: 'test', TEST_DATABASE_PATH: ':memory:' })).toEqual([]);
  });
});
