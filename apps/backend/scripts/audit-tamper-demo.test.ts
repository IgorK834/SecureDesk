import { spawnSync } from 'node:child_process';
import { linkSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditAnchorPath } from '../src/server/audit/anchor';
import { appendAuditEntry } from '../src/server/audit/append';
import { createDb, type AppDb } from '../src/server/db/connection';
import { runMigrations } from '../src/server/db/migrate';
import { runAuditTamperDemo } from './audit-tamper-demo/demo';

const root = path.resolve(import.meta.dirname, '../../..');
const verificationOutput = [
  'UPDATE blocked: audit_log is append-only',
  'DELETE blocked: audit_log is append-only',
  '1 Changed field before: INTACT',
  '1 Changed field after: TAMPERED seq=2 HASH_MISMATCH',
  '2 Middle entry before: INTACT',
  '2 Middle entry after: TAMPERED seq=3 SEQUENCE_GAP',
  '3 Tail before: INTACT',
  '3 Tail after, chain only: INTACT',
  '3 Tail after, original anchor: TAMPERED seq=3 HEAD_MISMATCH',
  '4 Alternate synthetic history before: INTACT',
  '4 Alternate history after, chain only: INTACT',
  '4 Alternate history after, original anchor: TAMPERED seq=3 HEAD_MISMATCH',
  '4 Alternate history after, paired local anchor: INTACT',
  'An off-host copy of the original anchor can distinguish the two internally valid histories.',
];

let directory: string;
let env: NodeJS.ProcessEnv;
let db: AppDb;
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'securedesk-e2e-fixture-'));
  env = {
    PATH: process.env.PATH ?? '',
    NODE_ENV: 'development',
    DATABASE_PATH: path.join(directory, 'development.sqlite'),
    TEST_DATABASE_PATH: path.join(directory, 'test.sqlite'),
    E2E_DATABASE_PATH: path.join(directory, 'e2e.sqlite'),
    AUDIT_ANCHOR_PATH: '',
  };
  db = createDb(env.E2E_DATABASE_PATH!);
  runMigrations(db);
  appendAuditEntry(db, {
    action: 'AUTH_LOGIN_FAILURE',
    actorType: 'SYSTEM',
    outcome: 'FAILURE',
    details: { reason: 'BAD_CREDENTIALS' },
    requestId: 'source-private-request',
  });
});

afterEach(() => {
  if (db.$client.open) db.$client.close();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('audit tamper demo', () => {
  it('SEC-76 SEC-83 SEC-84 SEC-85 SEC-86 produces all four findings and keeps the E2E data and anchors intact', async () => {
    const source = env.E2E_DATABASE_PATH!;
    const anchor = auditAnchorPath(source)!;
    const wal = readFileSync(source + '-wal');
    const savedAnchor = readFileSync(anchor);
    const externalAnchor = path.join(directory, 'existing-witness.json');
    writeFileSync(externalAnchor, 'fixture sentinel');
    vi.stubEnv('AUDIT_ANCHOR_PATH', externalAnchor);
    const lines: string[] = [];

    await runAuditTamperDemo(env, (line) => lines.push(line));

    expect(lines).toHaveLength(verificationOutput.length);
    for (const [index, text] of verificationOutput.entries()) {
      expect(lines[index]).toContain(text);
    }
    expect(lines.join('\n')).not.toContain('source-private-request');
    expect(readFileSync(source + '-wal')).toEqual(wal);
    expect(readFileSync(anchor)).toEqual(savedAnchor);
    expect(readFileSync(externalAnchor, 'utf8')).toBe('fixture sentinel');
    expect(process.env.AUDIT_ANCHOR_PATH).toBe(externalAnchor);
  });

  it('refuses production, a missing source, and the configured development database', async () => {
    const print = vi.fn();
    await expect(runAuditTamperDemo({ ...env, NODE_ENV: 'production' }, print)).rejects.toThrow(
      /production/,
    );
    await expect(runAuditTamperDemo({ ...env, E2E_DATABASE_PATH: '' }, print)).rejects.toThrow(
      /E2E_DATABASE_PATH is not set/,
    );
    await expect(
      runAuditTamperDemo(
        { ...env, E2E_DATABASE_PATH: path.join(directory, 'missing.sqlite') },
        print,
      ),
    ).rejects.toThrow(/existing SQLite file/);
    await expect(
      runAuditTamperDemo({ ...env, DATABASE_PATH: env.E2E_DATABASE_PATH }, print),
    ).rejects.toThrow(/must be different files/);
    expect(print).not.toHaveBeenCalled();
  });

  it('rejects symbolic and hard link aliases of the development and test databases', async () => {
    symlinkSync(env.E2E_DATABASE_PATH!, env.DATABASE_PATH!);
    await expect(runAuditTamperDemo(env, vi.fn())).rejects.toThrow(/alias DATABASE_PATH/);
    rmSync(env.DATABASE_PATH!);
    linkSync(env.E2E_DATABASE_PATH!, env.TEST_DATABASE_PATH!);
    await expect(runAuditTamperDemo(env, vi.fn())).rejects.toThrow(/alias TEST_DATABASE_PATH/);
  });

  it('fails the demo if the backup is missing the append-only trigger', async () => {
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    await expect(runAuditTamperDemo(env, vi.fn())).rejects.toThrow(
      /UPDATE succeeded on the E2E backup/,
    );
    expect(db.$client.prepare('SELECT count(*) AS n FROM audit_log').get()).toEqual({ n: 1 });
  });

  it('runs the npm command and exposes only the evidence columns in the read-only table helper', () => {
    const cli = spawnSync('npm', ['run', 'audit:tamper-demo'], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    expect(cli.stderr).toBe('');
    expect(cli.status).toBe(0);
    for (const text of verificationOutput) expect(cli.stdout).toContain(text);

    const forbidden = spawnSync('npm', ['run', 'audit:tamper-demo'], {
      cwd: root,
      env: { ...env, NODE_ENV: 'production' },
      encoding: 'utf8',
    });
    expect(forbidden.status).toBe(1);
    expect(forbidden.stderr).toContain('unavailable in production');

    const table = spawnSync('sh', ['scripts/show-audit-table.sh', env.E2E_DATABASE_PATH!], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    expect(table.status).toBe(0);
    expect(table.stdout).toContain('seq\ttime (UTC)\taction\toutcome\tprev_hash\tentry_hash');
    expect(table.stdout.split('\n')[1]).toMatch(
      /^1\t[\dT:.-]+Z\tAUTH_LOGIN_FAILURE\tFAILURE\t0{12}\t[a-f0-9]{12}$/,
    );
    expect(table.stdout).not.toContain('source-private-request');
  }, 30_000);
});
