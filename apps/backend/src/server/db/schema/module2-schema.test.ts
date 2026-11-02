import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureError, createMigratedDb, insertUser, sqliteCode } from '../__fixtures__/test-db';
import { createDb, type AppDb } from '../connection';
import { MIGRATIONS_FOLDER, runMigrations } from '../migrate';
import {
  ALERT_STATUSES,
  HONEYTOKEN_KINDS,
  LOGIN_ATTEMPT_KINDS,
  LOGIN_ATTEMPT_OUTCOMES,
  SECURITY_EVENT_SEVERITIES,
  captchaChallenges,
  honeytokens,
  loginAttempts,
  securityEvents,
  securitySettings,
} from '.';

// Task 7.1: the tables of Module 2 refuse what the application should never write, at the
// database level, and arrive on an existing Module 1 database without losing a row.

let db: AppDb;
beforeEach(() => {
  db = createMigratedDb();
});
afterEach(() => db.$client.close());

const attempt = (overrides: Partial<typeof loginAttempts.$inferInsert> = {}) => ({
  ipKey: '203.0.113.5',
  kind: 'CREDENTIAL' as const,
  outcome: 'FAILED' as const,
  ...overrides,
});
const event = (overrides: Partial<typeof securityEvents.$inferInsert> = {}) => ({
  type: 'ACCOUNT_LOCKED',
  severity: 'WARNING' as const,
  requestId: 'req-1',
  details: '{}',
  ...overrides,
});
const trap = (overrides: Partial<typeof honeytokens.$inferInsert> = {}) => ({
  id: 'account-trap-backup-admin',
  kind: 'ACCOUNT_TRAP' as const,
  label: 'Trap account',
  ...overrides,
});

describe('login_attempts', () => {
  it('stores an attempt with its defaults and no resolution yet', () => {
    db.insert(loginAttempts)
      .values(attempt({ loginNormalized: 'admin', outcome: 'PENDING' }))
      .run();

    expect(db.select().from(loginAttempts).all()).toMatchObject([
      { loginNormalized: 'admin', ipKey: '203.0.113.5', outcome: 'PENDING', resolvedAt: null },
    ]);
  });

  it('accepts every kind and every outcome the code names', () => {
    for (const kind of LOGIN_ATTEMPT_KINDS) {
      for (const outcome of LOGIN_ATTEMPT_OUTCOMES) {
        db.insert(loginAttempts).values(attempt({ kind, outcome })).run();
      }
    }

    expect(db.select().from(loginAttempts).all()).toHaveLength(
      LOGIN_ATTEMPT_KINDS.length * LOGIN_ATTEMPT_OUTCOMES.length,
    );
  });

  it('refuses an unknown kind at the database level', () => {
    const error = captureError(() =>
      db.$client
        .prepare(
          "INSERT INTO login_attempts (id, ip_key, kind, outcome, occurred_at) VALUES ('a', 'x', 'SMOKE_SIGNAL', 'FAILED', 1)",
        )
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('refuses an unknown outcome at the database level', () => {
    const error = captureError(() =>
      db.$client
        .prepare(
          "INSERT INTO login_attempts (id, ip_key, kind, outcome, occurred_at) VALUES ('a', 'x', 'CREDENTIAL', 'MAYBE', 1)",
        )
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('requires an address key', () => {
    const error = captureError(() =>
      db
        .insert(loginAttempts)
        .values(attempt({ ipKey: undefined as never }))
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_NOTNULL');
  });
});

describe('security_events', () => {
  it('stores an event with no alert and no acknowledgement by default', () => {
    db.insert(securityEvents).values(event()).run();

    expect(db.select().from(securityEvents).all()).toMatchObject([
      { type: 'ACCOUNT_LOCKED', alertStatus: 'NONE', acknowledgedAt: null, acknowledgedBy: null },
    ]);
  });

  it('accepts every severity and alert status the code names', () => {
    for (const severity of SECURITY_EVENT_SEVERITIES) {
      for (const alertStatus of ALERT_STATUSES) {
        db.insert(securityEvents).values(event({ severity, alertStatus })).run();
      }
    }

    expect(db.select().from(securityEvents).all()).toHaveLength(
      SECURITY_EVENT_SEVERITIES.length * ALERT_STATUSES.length,
    );
  });

  it.each([
    ['severity', 'FATAL', 'NONE'],
    ['alert_status', 'WARNING', 'ALMOST'],
  ])('refuses an unknown %s at the database level', (_column, severity, alertStatus) => {
    const error = captureError(() =>
      db.$client
        .prepare(
          "INSERT INTO security_events (id, type, severity, occurred_at, details, request_id, alert_status) VALUES ('a', 't', ?, 1, '{}', 'r', ?)",
        )
        .run(severity, alertStatus),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('keeps pointing at a real user and a real honeytoken (foreign keys)', () => {
    const adminId = insertUser(db, { login: 'ADMIN' });
    db.insert(honeytokens).values(trap()).run();
    db.insert(securityEvents)
      .values(event({ userId: adminId, acknowledgedBy: adminId, honeytokenId: trap().id }))
      .run();

    for (const overrides of [
      { userId: 'no-such-user' },
      { acknowledgedBy: 'no-such-user' },
      { honeytokenId: 'no-such-token' },
    ]) {
      const error = captureError(() => db.insert(securityEvents).values(event(overrides)).run());
      expect(sqliteCode(error), JSON.stringify(overrides)).toBe('SQLITE_CONSTRAINT_FOREIGNKEY');
    }
  });
});

describe('honeytokens', () => {
  it('stores a trap enabled and never triggered by default', () => {
    db.insert(honeytokens)
      .values(trap({ loginNormalized: 'backup_admin' }))
      .run();

    expect(db.select().from(honeytokens).all()).toMatchObject([
      { enabled: true, triggerCount: 0, lastTriggeredAt: null, alertUrlEnv: null },
    ]);
  });

  it('accepts every kind the code names and refuses any other', () => {
    for (const kind of HONEYTOKEN_KINDS) {
      db.insert(honeytokens)
        .values(trap({ id: kind, kind }))
        .run();
    }
    const error = captureError(() =>
      db.$client
        .prepare(
          "INSERT INTO honeytokens (id, kind, label, created_at) VALUES ('x', 'DNS', 'l', 1)",
        )
        .run(),
    );

    expect(db.select().from(honeytokens).all()).toHaveLength(HONEYTOKEN_KINDS.length);
    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('allows one trap per login, and any number of tokens without a login', () => {
    db.insert(honeytokens)
      .values(trap({ loginNormalized: 'backup_admin' }))
      .run();
    db.insert(honeytokens)
      .values(trap({ id: 'aws-1', kind: 'AWS_KEYS' }))
      .run();
    db.insert(honeytokens)
      .values(trap({ id: 'aws-2', kind: 'AWS_KEYS' }))
      .run();

    const error = captureError(() =>
      db
        .insert(honeytokens)
        .values(trap({ id: 'second', loginNormalized: 'backup_admin' }))
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_UNIQUE');
  });
});

describe('captcha_challenges', () => {
  it('stores a challenge as an unconsumed MAC with an expiry', () => {
    db.insert(captchaChallenges)
      .values({
        purpose: 'login',
        answerMac: 'mac',
        expiresAt: new Date(Date.now() + 120_000),
        ipKey: '203.0.113.5',
      })
      .run();

    expect(db.select().from(captchaChallenges).all()).toMatchObject([
      { purpose: 'login', answerMac: 'mac', consumedAt: null },
    ]);
  });
});

describe('security_settings login-protection columns', () => {
  it.each([
    ['maxFailedLoginAttempts', 2],
    ['maxFailedLoginAttempts', 21],
    ['ipFailedAttemptLimit', 4],
    ['ipFailedAttemptLimit', 501],
    ['sprayingDistinctLoginThreshold', 2],
    ['sprayingDistinctLoginThreshold', 51],
    ['securityEventRetentionDays', 6],
    ['securityEventRetentionDays', 366],
  ] as const)('refuses %s = %i at the database level', (column, value) => {
    const error = captureError(() =>
      db
        .insert(securitySettings)
        .values({ id: 1, [column]: value })
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('gives a bare row the Module 2 defaults', () => {
    db.insert(securitySettings).values({ id: 1 }).run();

    expect(db.select().from(securitySettings).get()).toMatchObject({
      maxFailedLoginAttempts: 5,
      ipFailedAttemptLimit: 20,
      sprayingDistinctLoginThreshold: 8,
      securityEventRetentionDays: 90,
    });
  });
});

describe('migration 0004 on a Module 1 database', () => {
  let folder: string;
  let file: string;
  beforeEach(() => {
    folder = mkdtempSync(path.join(os.tmpdir(), 'securedesk-module1-'));
    file = path.join(folder, 'module1.sqlite');
  });
  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  /** The migrations folder as Module 1 shipped it: everything before 0004. */
  function module1Migrations(): string {
    const target = path.join(folder, 'migrations');
    cpSync(MIGRATIONS_FOLDER, target, { recursive: true });
    const journalPath = path.join(target, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
      entries: { tag: string }[];
    };
    journal.entries = journal.entries.filter((entry) => !entry.tag.startsWith('0004_'));
    writeFileSync(journalPath, JSON.stringify(journal));
    return target;
  }

  it('keeps the existing rows, adds the new tables and leaves no foreign-key violation', () => {
    const upgraded = createDb(file);
    try {
      runMigrations(upgraded, module1Migrations());
      const adminId = insertUser(upgraded, { login: 'ADMIN' });
      upgraded.$client
        .prepare(
          'INSERT INTO security_settings (id, min_password_length, session_idle_timeout_minutes, updated_at, updated_by) VALUES (1, 16, 9, 1, ?)',
        )
        .run(adminId);
      expect(upgraded.$client.pragma('table_info(security_settings)')).toHaveLength(7);

      runMigrations(upgraded);

      expect(upgraded.$client.prepare('SELECT * FROM security_settings').all()).toMatchObject([
        {
          id: 1,
          min_password_length: 16,
          session_idle_timeout_minutes: 9,
          updated_by: adminId,
          max_failed_login_attempts: 5,
          ip_failed_attempt_limit: 20,
          spraying_distinct_login_threshold: 8,
          security_event_retention_days: 90,
        },
      ]);
      expect(upgraded.$client.prepare('SELECT login FROM users').all()).toEqual([
        { login: 'ADMIN' },
      ]);
      expect(upgraded.select().from(loginAttempts).all()).toEqual([]);
      expect(upgraded.$client.pragma('foreign_key_check')).toEqual([]);
    } finally {
      upgraded.$client.close();
    }
  });
});
