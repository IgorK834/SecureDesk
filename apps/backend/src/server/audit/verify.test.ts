import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import { createDb, type AppDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { auditLog } from '../db/schema';
import { assertAuditAnchorConfig, auditAnchorPath, readAuditAnchor } from './anchor';
import { appendAuditEntry } from './append';
import { canonicalize, computeEntryHash, GENESIS_HASH } from './chain';
import { verifyAuditChain } from './verify';

const entry = {
  actorType: 'SYSTEM',
  action: 'AUTH_LOGIN_FAILURE',
  outcome: 'FAILURE',
  details: { reason: 'BAD_CREDENTIALS' },
  requestId: 'verification-fixture',
} as const;
const time = { now: () => new Date('2026-11-26T09:15:00.123Z') };

describe('audit verification with a disposable database and anchor', () => {
  let folder: string;
  let db: AppDb;
  let anchor: string;

  function append() {
    return appendAuditEntry(db, entry, time);
  }

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'securedesk-audit-verify-'));
    anchor = join(folder, 'evidence', 'head-anchor.json');
    vi.stubEnv('AUDIT_ANCHOR_PATH', anchor);
    db = createDb(join(folder, 'audit.sqlite'));
    runMigrations(db);
  });

  afterEach(() => {
    db.$client.close();
    rmSync(folder, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('SEC-82 reports the correct counts and head for empty and intact logs', async () => {
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'INTACT',
      checkedEntries: 0,
      headSeq: null,
      headHash: null,
      warnings: [],
    });
    append();
    const head = append();
    await expect(verifyAuditChain(db, { batchSize: 1 })).resolves.toMatchObject({
      status: 'INTACT',
      checkedEntries: 2,
      headSeq: head.seq,
      headHash: head.entryHash,
      durationMs: expect.any(Number),
      warnings: [],
    });
  });

  it('SEC-83 locates a changed field', async () => {
    const row = append();
    append();
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    db.$client
      .prepare('UPDATE audit_log SET description = ? WHERE seq = ?')
      .run('Changed', row.seq);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'TAMPERED',
      checkedEntries: 2,
      firstProblem: { seq: row.seq, id: row.id, kind: 'HASH_MISMATCH' },
    });
  });

  it('SEC-84 identifies the first entry after a missing middle row', async () => {
    append();
    const middle = append();
    const last = append();
    db.$client.exec('DROP TRIGGER audit_log_no_delete');
    db.$client.prepare('DELETE FROM audit_log WHERE seq = ?').run(middle.seq);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'TAMPERED',
      checkedEntries: 2,
      firstProblem: { seq: last.seq, id: last.id, kind: 'SEQUENCE_GAP' },
    });
  });

  it('detects malformed hashes, a wrong genesis and a broken predecessor in order', async () => {
    for (let n = 0; n < 3; n++) append();
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    const changePrevious = db.$client.prepare('UPDATE audit_log SET prev_hash = ? WHERE seq = ?');
    changePrevious.run('1'.repeat(64), 1);
    changePrevious.run('2'.repeat(64), 2);
    changePrevious.run('z'.repeat(64), 3);
    const result = await verifyAuditChain(db);
    expect(result).toMatchObject({
      status: 'TAMPERED',
      problems: [
        { seq: 1, kind: 'GENESIS_MISMATCH' },
        { seq: 2, kind: 'CHAIN_BROKEN' },
        { seq: 3, kind: 'MALFORMED_ROW' },
      ],
    });
  });

  it('bounds the problems list and retains the first problem and a head mismatch', async () => {
    for (let n = 0; n < 23; n++) append();
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    db.$client.prepare('UPDATE audit_log SET description = ?').run('Changed');
    writeFileSync(anchor, 'invalid anchor');
    const result = await verifyAuditChain(db, { batchSize: 3 });
    expect(result).toMatchObject({
      status: 'TAMPERED',
      checkedEntries: 23,
      firstProblem: { seq: 1, kind: 'HASH_MISMATCH' },
    });
    if (result.status !== 'TAMPERED') throw new Error('Expected tampering');
    expect(result.problems).toHaveLength(20);
    expect(result.problems.at(-1)).toMatchObject({ kind: 'HEAD_MISMATCH' });
  });

  it('refuses concurrent work and verifies the head selected at the start', async () => {
    const otherConnection = createDb(db.$client.name);
    try {
      append();
      const head = append();
      const running = verifyAuditChain(db, { batchSize: 1 });
      await expect(verifyAuditChain(otherConnection)).rejects.toMatchObject({
        status: 409,
        code: 'VERIFICATION_IN_PROGRESS',
      });
      append();
      await expect(running).resolves.toMatchObject({
        status: 'INTACT',
        headSeq: head.seq,
        checkedEntries: 2,
        warnings: [],
      });
      await expect(verifyAuditChain(db)).resolves.toMatchObject({ checkedEntries: 3 });
      await expect(verifyAuditChain(db, { batchSize: 0 })).rejects.toThrow(RangeError);
    } finally {
      otherConnection.$client.close();
    }
  });

  it('SEC-85 detects tail truncation and preserves the anchor after another append', async () => {
    append();
    append();
    const last = append();
    const before = readFileSync(anchor, 'utf8');
    db.$client.exec('DROP TRIGGER audit_log_no_delete');
    db.$client.prepare('DELETE FROM audit_log WHERE seq >= ?').run(2);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'TAMPERED',
      headSeq: 1,
      checkedEntries: 1,
      firstProblem: { seq: last.seq, id: null, kind: 'HEAD_MISMATCH' },
    });
    const warning = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    append();
    expect(readFileSync(anchor, 'utf8')).toBe(before);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('audit.anchor.write_failed'));
  });

  it('SEC-86 detects a modified synthetic chain even when its row hashes agree', async () => {
    append();
    const last = append();
    const rows = db.select().from(auditLog).orderBy(auditLog.seq).all();
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    const update = db.$client.prepare(
      'UPDATE audit_log SET description = ?, prev_hash = ?, entry_hash = ? WHERE seq = ?',
    );
    let previous = GENESIS_HASH;
    for (const row of rows) {
      row.description = row.seq === 1 ? 'Changed fixture' : row.description;
      const hash = computeEntryHash(previous, canonicalize(row));
      update.run(row.description, previous, hash, row.seq);
      previous = hash;
    }
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'TAMPERED',
      headHash: previous,
      firstProblem: { seq: last.seq, id: last.id, kind: 'HEAD_MISMATCH' },
      problems: [{ seq: last.seq, id: last.id, kind: 'HEAD_MISMATCH' }],
    });
  });

  it('accepts an older matching anchor and reports a missing anchor as a warning', async () => {
    append();
    const older = readFileSync(anchor);
    append();
    writeFileSync(anchor, older);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'INTACT',
      checkedEntries: 2,
      warnings: [],
    });
    rmSync(anchor);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({
      status: 'INTACT',
      checkedEntries: 2,
      warnings: ['ANCHOR_MISSING'],
    });
  });

  it('writes private head metadata only, and only after the outer transaction commits', () => {
    expect(() =>
      db.transaction((tx) => {
        appendAuditEntry(tx, entry, time);
        expect(readAuditAnchor(db.$client.name)).toEqual({ status: 'MISSING' });
        throw new Error('outer rollback');
      }),
    ).toThrow('outer rollback');
    expect(readAuditAnchor(db.$client.name)).toEqual({ status: 'MISSING' });
    const row = db.transaction((tx) =>
      tx.transaction((nested) => {
        const saved = appendAuditEntry(nested, entry, time);
        expect(readAuditAnchor(db.$client.name)).toEqual({ status: 'MISSING' });
        return saved;
      }),
    );
    expect(JSON.parse(readFileSync(anchor, 'utf8'))).toEqual({
      seq: row.seq,
      hash: row.entryHash,
      writtenAt: expect.stringMatching(/\.\d{3}Z$/),
    });
    expect(statSync(anchor).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(anchor)).mode & 0o777).toBe(0o700);
    db.transaction((tx) => {
      expect(() =>
        tx.transaction((nested) => {
          appendAuditEntry(nested, entry, time);
          throw new Error('savepoint rollback');
        }),
      ).toThrow('savepoint rollback');
    });
    expect(readAuditAnchor(db.$client.name)).toMatchObject({
      status: 'PRESENT',
      anchor: { seq: row.seq, hash: row.entryHash },
    });
    expect(db.select().from(auditLog).all()).toHaveLength(1);
  });

  it('refuses served paths, symlinks, the database itself and an insecure directory', () => {
    for (const directory of ['public', 'frontend']) {
      vi.stubEnv('AUDIT_ANCHOR_PATH', join(folder, directory, 'head-anchor.json'));
      expect(assertAuditAnchorConfig).toThrow(/outside public and frontend/);
    }
    vi.stubEnv('AUDIT_ANCHOR_PATH', db.$client.name);
    expect(() => auditAnchorPath(db.$client.name)).toThrow(/separate from the database/);
    expect(readAuditAnchor(db.$client.name)).toEqual({ status: 'INVALID' });
    vi.stubEnv('AUDIT_ANCHOR_PATH', anchor);
    append();
    const alias = join(folder, 'link.json');
    symlinkSync(anchor, alias);
    vi.stubEnv('AUDIT_ANCHOR_PATH', alias);
    expect(assertAuditAnchorConfig).toThrow(/regular file/);
    chmodSync(dirname(anchor), 0o755);
    const warning = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.stubEnv('AUDIT_ANCHOR_PATH', anchor);
    append();
    expect(readAuditAnchor(db.$client.name)).toMatchObject({
      status: 'PRESENT',
      anchor: { seq: 1 },
    });
    expect(warning).toHaveBeenCalled();
  });
});

it('verifies 100,000 entries within 10 seconds and yields within 50 ms', async () => {
  const db = createMigratedDb();
  try {
    const { details, entryHash, prevHash, ...sample } = appendAuditEntry(db, entry, time);
    let hash = entryHash;
    const insert = db
      .insert(auditLog)
      .values({
        ...sample,
        seq: 1,
        id: '',
        details,
        entryHash: '',
        prevHash,
      })
      .toSQL();
    const statement = db.$client.prepare(insert.sql);
    db.$client.transaction(() => {
      for (let seq = 2; seq <= 100_000; seq++) {
        const row = { ...sample, seq, id: 'fixture-' + seq, details };
        const next = computeEntryHash(hash, canonicalize(row));
        statement.run(
          row.seq,
          row.id,
          row.occurredAt,
          row.actorType,
          row.actorUserId,
          row.actorLogin,
          row.subjectLogin,
          row.subjectRef,
          row.ip,
          row.action,
          row.description,
          row.outcome,
          row.details,
          row.requestId,
          hash,
          next,
        );
        hash = next;
      }
    })();

    let lastYield = performance.now();
    let cpuAtYield = process.threadCpuUsage();
    let longestInterval = 0;
    let longestCpuSlice = 0;
    let done = false;
    const verification = verifyAuditChain(db).finally(() => {
      done = true;
    });
    while (!done) {
      await setImmediate();
      const now = performance.now();
      const cpu = process.threadCpuUsage(cpuAtYield);
      longestCpuSlice = Math.max(longestCpuSlice, (cpu.user + cpu.system) / 1000);
      longestInterval = Math.max(longestInterval, now - lastYield);
      lastYield = now;
      cpuAtYield = process.threadCpuUsage();
    }
    const result = await verification;
    expect(result).toMatchObject({ status: 'INTACT', checkedEntries: 100_000, headHash: hash });
    console.info(
      `Audit verification: ${result.durationMs} ms, longest interval ${longestInterval.toFixed(1)} ms wall and ${longestCpuSlice.toFixed(1)} ms CPU`,
    );
    expect(result.durationMs).toBeLessThan(10_000);
    // Parallel test workers can deschedule this thread between two callbacks.
    expect(longestCpuSlice).toBeLessThanOrEqual(50);
  } finally {
    db.$client.close();
  }
}, 20_000);
