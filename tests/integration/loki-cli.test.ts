import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { appendAuditEntry } from '../../apps/backend/src/server/audit/append';
import { createDb } from '../../apps/backend/src/server/db/connection';
import { runMigrations } from '../../apps/backend/src/server/db/migrate';

it('SEC-95 sends a real audit:ship CLI run only to a local Loki stub and persists progress across processes', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'securedesk-loki-cli-'));
  const file = path.join(folder, 'e2e.sqlite');
  const db = createDb(file);
  const delivered: { seq: number; action: string; prev_hash: string; entry_hash: string }[] = [];
  const paths: (string | undefined)[] = [];
  let available = false;
  const server = createServer(async (req, res) => {
    paths.push(req.url);
    let text = '';
    for await (const chunk of req) text += chunk;
    if (!available) {
      res.writeHead(503).end();
      return;
    }
    for (const [, line] of JSON.parse(text).streams[0].values) delivered.push(JSON.parse(line));
    res.writeHead(204).end();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address');

    runMigrations(db);
    db.transaction((tx) => {
      for (let i = 0; i < 3; i++)
        appendAuditEntry(tx, {
          actorType: 'SYSTEM',
          requestId: 'loki-cli-fixture',
          action: 'AUTH_LOGIN_FAILURE',
          outcome: 'FAILURE',
          details: { reason: 'BAD_CREDENTIALS' },
        });
    });
    const env = {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_PATH: path.join(folder, 'dev.sqlite'),
      TEST_DATABASE_PATH: path.join(folder, 'test.sqlite'),
      E2E_DATABASE_PATH: file,
      AUDIT_ANCHOR_PATH: '',
      LOKI_PUSH_URL: 'http://127.0.0.1:' + address.port,
    };
    const run = (override = {}) =>
      promisify(execFile)('npm', ['run', 'audit:ship'], {
        cwd: path.resolve(import.meta.dirname, '../..'),
        env: { ...env, ...override },
      });

    await expect(run()).rejects.toMatchObject({ code: 1 });
    expect(delivered).toEqual([]);
    available = true;
    expect((await run()).stdout).toContain('"shipped":3');
    expect((await run()).stdout).toContain('"shipped":0');
    expect((await run({ LOKI_PUSH_URL: '' })).stdout).toContain('Loki shipping is disabled');
    expect(paths).toEqual(['/loki/api/v1/push', '/loki/api/v1/push']);
    expect(delivered.map(({ seq }) => seq)).toEqual([1, 2, 3]);
    expect(delivered.every(({ action }) => action === 'AUTH_LOGIN_FAILURE')).toBe(true);
    expect(delivered[0]?.entry_hash).toBe(delivered[1]?.prev_hash);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.$client.close();
    rmSync(folder, { recursive: true, force: true });
  }
}, 25_000);
