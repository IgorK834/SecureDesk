import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import { createDb, type AppDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { auditLog, users, type AuditLogRow } from '../db/schema';
import { appendAuditEntry, type AuditEntryInput } from './append';
import { canonicalDetails, canonicalize } from './chain';

const input = {
  action: 'AUTH_LOGIN_FAILURE',
  outcome: 'FAILURE',
  details: { reason: 'BAD_CREDENTIALS' },
  actorType: 'ANONYMOUS',
  subjectRef: 'ref:0123456789abcdef',
  requestId: 'test-request',
} satisfies AuditEntryInput;

const time = { now: () => new Date('2026-11-26T10:15:03.123+01:00') };

// This is deliberately separate from the production serializer. An accidental version or
// field-order change has to break this contract test even if appends still agree with themselves.
function independentFields(row: AuditLogRow) {
  return [
    'sd-audit-v1',
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
  ];
}

function independentHash(previous: string, fields: unknown[]) {
  const hash = createHash('sha256');
  hash.update(Buffer.from(previous + '\n', 'utf8'));
  hash.update(Buffer.from(JSON.stringify(fields), 'utf8'));
  return hash.digest('hex');
}

function expectValidChain(rows: AuditLogRow[]) {
  let previous = '0'.repeat(64);
  for (const [index, row] of rows.entries()) {
    expect(row.seq).toBe(index + 1);
    expect(row.prevHash).toBe(previous);
    expect(row.entryHash).toBe(independentHash(previous, independentFields(row)));
    previous = row.entryHash;
  }
}

describe('appendAuditEntry', () => {
  let db: AppDb;
  beforeEach(() => {
    db = createMigratedDb();
  });
  afterEach(() => db.$client.close());

  it('SEC-75 stores a UTC timestamp and a versioned hash that an independent implementation reproduces', () => {
    const actorUserId = insertUser(db);
    const first = appendAuditEntry(
      db,
      {
        ...input,
        actorType: 'USER',
        actorUserId,
        actorLogin: 'actor',
        subjectRef: null,
        subjectLogin: 'subject',
        ip: '2001:db8::1',
      },
      time,
    );
    appendAuditEntry(db, input, time);
    expectValidChain(db.select().from(auditLog).orderBy(auditLog.seq).all());

    expect(first.occurredAt).toBe('2026-11-26T09:15:03.123Z');
    expect(canonicalize(first)).toBe(JSON.stringify(independentFields(first)));
    const fields = independentFields(first);
    const reordered = [...fields.slice(0, 2), first.occurredAt, first.id, ...fields.slice(4)];
    for (const changed of [
      independentFields({ ...first, occurredAt: '2026-11-26T09:15:03.124Z' }),
      reordered,
      ['sd-audit-v2', ...fields.slice(1)],
    ]) {
      expect(independentHash(first.prevHash, changed)).not.toBe(first.entryHash);
    }
  });

  it('stores compact, recursively sorted object keys and preserves array order', () => {
    const row = appendAuditEntry(
      db,
      {
        ...input,
        action: 'SETTINGS_CHANGED',
        outcome: 'SUCCESS',
        details: {
          changes: [
            { to: false, key: 'rejectPersonalDataInPassword', from: true },
            { to: null, key: 'passwordMaxAgeDays', from: 60 },
          ],
        },
      },
      time,
    );
    expect(row.details).toBe(
      '{"changes":[{"from":true,"key":"rejectPersonalDataInPassword","to":false},{"from":60,"key":"passwordMaxAgeDays","to":null}]}',
    );
    expect(canonicalDetails({ 2: true, 10: false, a: [2, 1] })).toBe(
      '{"10":false,"2":true,"a":[2,1]}',
    );
    expectValidChain([row]);
  });

  it('rolls back the audit entry and sequence allocation with the outer transaction', () => {
    insertUser(db);
    expect(() =>
      db.transaction(
        (tx) => {
          tx.update(users).set({ firstName: 'Rolled back' }).run();
          expect(appendAuditEntry(tx, input, time).seq).toBe(1);
          throw new Error('roll back both writes');
        },
        { behavior: 'immediate' },
      ),
    ).toThrow('roll back both writes');

    expect(db.select().from(auditLog).all()).toEqual([]);
    expect(db.select().from(users).get()?.firstName).toBe('Test');
    expect(appendAuditEntry(db, input, time).seq).toBe(1);
  });

  it('respects sqlite_sequence when it is ahead of the newest row', () => {
    const first = appendAuditEntry(db, input, time);
    db.$client.prepare("UPDATE sqlite_sequence SET seq = 9 WHERE name = 'audit_log'").run();
    expect(appendAuditEntry(db, input, time)).toMatchObject({ seq: 10, prevHash: first.entryHash });
  });
});

it('SEC-74 places 50 concurrent appends into a gapless, valid chain', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'securedesk-audit-concurrency-'));
  const path = join(folder, 'append.sqlite');
  const db = createDb(path);
  const workers: Worker[] = [];
  const gate = new Int32Array(new SharedArrayBuffer(4));
  let ready = 0;
  try {
    runMigrations(db);
    await Promise.all(
      Array.from(
        { length: 5 },
        (_, workerId) =>
          new Promise<void>((resolve, reject) => {
            // Each worker opens an independent connection and begins from the same barrier.
            const worker = new Worker(
              `
        const { parentPort, workerData: data } = require('node:worker_threads');
        require('tsx/cjs');
        const { createDb } = require(data.connection);
        const { appendAuditEntry } = require(data.append);
        const db = createDb(data.path);
        try {
          const gate = new Int32Array(data.gate);
          parentPort.postMessage('ready');
          Atomics.wait(gate, 0, 0);
          for (let i = 0; i < 10; i++) {
            appendAuditEntry(db, { ...data.input, requestId: data.workerId + ':' + i });
          }
        } finally {
          db.$client.close();
        }
      `,
              {
                eval: true,
                workerData: {
                  path,
                  gate: gate.buffer,
                  workerId,
                  input,
                  append: join(__dirname, 'append.ts'),
                  connection: join(__dirname, '../db/connection.ts'),
                },
              },
            );
            workers.push(worker);
            worker.on('message', () => {
              if (++ready === 5) {
                Atomics.store(gate, 0, 1);
                Atomics.notify(gate, 0);
              }
            });
            worker.on('error', reject);
            worker.on('exit', (code) =>
              code === 0 ? resolve() : reject(new Error(`Worker exited: ${code}`)),
            );
          }),
      ),
    );
    const rows = db.select().from(auditLog).orderBy(auditLog.seq).all();
    expect(rows).toHaveLength(50);
    expect(new Set(rows.map((row) => row.requestId)).size).toBe(50);
    expectValidChain(rows);
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
    db.$client.close();
    rmSync(folder, { recursive: true, force: true });
  }
}, 15_000);
