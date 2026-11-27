import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendAuditEntry } from '../../audit/append';
import { verifyAuditChain } from '../../audit/verify';
import { createMigratedDb, insertUser } from '../__fixtures__/test-db';
import { createDb, type AppDb } from '../connection';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrate';
import { auditLog, securityEvents, users } from './index';

const values = {
  id: 'test-audit-id',
  occurredAt: '2026-11-26T09:15:03.123Z',
  actorType: 'ANONYMOUS',
  action: 'AUTH_LOGIN_FAILURE',
  description: 'Sign-in refused.',
  outcome: 'FAILURE',
  details: '{"reason":"BAD_CREDENTIALS"}',
  requestId: 'test-request',
  prevHash: '0'.repeat(64),
  entryHash: 'a'.repeat(64),
};

const insert = `
  INSERT INTO audit_log (id, occurred_at, actor_type, action, description, outcome, details,
                         request_id, prev_hash, entry_hash)
  VALUES (@id, @occurredAt, @actorType, @action, @description, @outcome, @details,
          @requestId, @prevHash, @entryHash)
`;

describe('audit_log constraints on a fresh database', () => {
  let db: AppDb;

  beforeEach(() => {
    db = createMigratedDb();
  });
  afterEach(() => db.$client.close());

  it('SEC-76 aborts UPDATE, DELETE and REPLACE with the same message', () => {
    const sqlite = db.$client;
    sqlite.pragma('recursive_triggers = OFF');
    sqlite.prepare(insert).run(values);

    expect(() => sqlite.prepare('UPDATE audit_log SET description = description').run()).toThrow(
      'audit_log is append-only',
    );
    expect(() => sqlite.prepare('DELETE FROM audit_log').run()).toThrow('audit_log is append-only');
    expect(() => sqlite.prepare(insert.replace('INSERT', 'INSERT OR REPLACE')).run(values)).toThrow(
      'audit_log is append-only',
    );
    expect(() =>
      sqlite
        .prepare(
          insert
            .replace('(id,', '(seq, id,')
            .replace('VALUES (', 'VALUES (1, ')
            .replace('INSERT', 'INSERT OR REPLACE'),
        )
        .run({ ...values, id: 'replacement' }),
    ).toThrow('audit_log is append-only');
    expect(sqlite.prepare('SELECT id FROM audit_log').all()).toEqual([{ id: values.id }]);
    expect(sqlite.pragma('foreign_key_check')).toEqual([]);
  });

  it.each([
    ['actorType', 'ROBOT'],
    ['outcome', 'UNKNOWN'],
    ['prevHash', 'a'.repeat(63)],
    ['entryHash', 'a'.repeat(65)],
  ])('refuses invalid %s at the database boundary', (field, value) => {
    expect(() => db.$client.prepare(insert).run({ ...values, [field]: value })).toThrow(
      'CHECK constraint failed',
    );
  });

  it('has the expected time and lookup indexes', () => {
    const indexes = (db.$client.pragma('index_list(audit_log)') as { name: string }[]).map(
      ({ name }) =>
        (db.$client.pragma(`index_info(${name})`) as { name: string }[]).map(
          (column) => column.name,
        ),
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        ['occurred_at'],
        ['action', 'occurred_at'],
        ['actor_user_id', 'occurred_at'],
        ['subject_login', 'occurred_at'],
        ['subject_login', 'action', 'seq'],
        ['subject_ref', 'occurred_at'],
      ]),
    );
  });
});

function copyMigrationsBefore(target: string, idx: number): void {
  mkdirSync(join(target, 'meta'), { recursive: true });
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, 'meta/_journal.json'), 'utf8'),
  ) as {
    entries: { idx: number; tag: string }[];
  };
  journal.entries = journal.entries.filter((entry) => entry.idx < idx);
  for (const { tag } of journal.entries) {
    copyFileSync(join(MIGRATIONS_FOLDER, tag + '.sql'), join(target, tag + '.sql'));
  }
  writeFileSync(join(target, 'meta/_journal.json'), JSON.stringify(journal));
}

it('upgrades a Module 2 database without changing users, security events or foreign keys', () => {
  const folder = mkdtempSync(join(tmpdir(), 'securedesk-audit-upgrade-'));
  const path = join(folder, 'upgrade.sqlite');
  const module2 = join(folder, 'module2');
  try {
    copyMigrationsBefore(module2, 6);

    const original = createDb(path);
    let originalUsers;
    let originalEvents;
    try {
      runMigrations(original, module2);
      const userId = insertUser(original);
      original
        .insert(securityEvents)
        .values({
          type: 'ACCOUNT_LOCKED',
          severity: 'WARNING',
          userId,
          details: '{}',
          requestId: 'pre-upgrade-request',
        })
        .run();
      originalUsers = original.select().from(users).all();
      originalEvents = original.select().from(securityEvents).all();
    } finally {
      original.$client.close();
    }

    const upgraded = createDb(path);
    try {
      runMigrations(upgraded);
      runMigrations(upgraded);
      expect(upgraded.select().from(users).all()).toEqual(originalUsers);
      expect(upgraded.select().from(securityEvents).all()).toEqual(originalEvents);
      expect(upgraded.$client.pragma('foreign_key_check')).toEqual([]);
      expect(upgraded.$client.prepare('SELECT * FROM audit_log').all()).toEqual([]);
    } finally {
      upgraded.$client.close();
    }
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

it('adds the detection index to an existing audit database without changing its chain', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'securedesk-detection-upgrade-'));
  const db = createDb(join(folder, 'upgrade.sqlite'));
  try {
    const prior = join(folder, 'prior');
    copyMigrationsBefore(prior, 8);
    runMigrations(db, prior);
    const row = appendAuditEntry(db, {
      actorType: 'SYSTEM',
      subjectLogin: 'fixture',
      action: 'AUTH_LOGIN_SUCCESS',
      outcome: 'SUCCESS',
      details: {},
      requestId: 'upgrade-fixture',
    });
    const index = 'audit_log_subject_login_action_seq_idx';
    expect(db.$client.pragma('index_info(' + index + ')')).toHaveLength(0);
    runMigrations(db);
    expect(db.$client.pragma('index_info(' + index + ')')).toMatchObject([
      { name: 'subject_login' },
      { name: 'action' },
      { name: 'seq' },
    ]);
    expect(db.select().from(auditLog).all()).toEqual([row]);
    expect(db.$client.pragma('foreign_key_check')).toEqual([]);
    await expect(verifyAuditChain(db)).resolves.toMatchObject({ status: 'INTACT', warnings: [] });
  } finally {
    db.$client.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
