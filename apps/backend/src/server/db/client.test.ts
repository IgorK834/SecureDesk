import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

type GlobalWithDb = { __securedeskDb?: { $client: { close(): void } } };

afterEach(() => {
  (globalThis as GlobalWithDb).__securedeskDb?.$client.close();
  delete (globalThis as GlobalWithDb).__securedeskDb;
  vi.unstubAllEnvs();
  vi.resetModules();
});

function useMemoryDb() {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DATABASE_PATH', '');
  vi.stubEnv('TEST_DATABASE_PATH', ':memory:');
}

describe('db (lazy singleton)', () => {
  it('does not open the database or need configuration just by being imported', async () => {
    // `next build` imports every route module in a checkout that has no .env at all.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'securedesk-lazy-'));
    const file = path.join(dir, 'never-created.sqlite');
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_DATABASE_PATH', file);

    await expect(import('./client')).resolves.toHaveProperty('db');

    expect((globalThis as GlobalWithDb).__securedeskDb).toBeUndefined();
    expect(existsSync(file)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('fails with a clear configuration error on first use when the path is missing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TEST_DATABASE_PATH', '');
    const { db } = await import('./client');

    expect(() => db.$client).toThrow(/TEST_DATABASE_PATH is not set/);
  });

  it('reuses one connection when the module is re-evaluated (Next.js dev HMR)', async () => {
    useMemoryDb();
    const first = (await import('./client')).db.$client;
    vi.resetModules();
    const second = (await import('./client')).db.$client;

    expect(second).toBe(first);
  });

  it('is created with foreign keys enforced', async () => {
    useMemoryDb();
    const { db } = await import('./client');

    expect(db.$client.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('forwards Drizzle methods correctly, so query code can use it like a normal db', async () => {
    useMemoryDb();
    const { db } = await import('./client');

    expect(db.all(sql`SELECT 1 AS x`)).toEqual([{ x: 1 }]);
  });
});
