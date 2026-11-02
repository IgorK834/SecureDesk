import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { captchaChallenges, loginAttempts, securityEvents, securitySettings } from '../db/schema';
import { PURGE_INTERVAL_MS, purgeExpired, purgeIfDue } from './purge';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date('2030-06-01T12:00:00.000Z');
const fakeClock = new FakeClock(T0);
const ago = (ms: number) => new Date(T0.getTime() - ms);

let db: AppDb;
beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db = createMigratedDb();
});
afterEach(() => {
  fakeClock.uninstall();
  db.$client.close();
});

const attempt = (id: string, occurredAt: Date) =>
  db
    .insert(loginAttempts)
    .values({ id, ipKey: 'ip', kind: 'CREDENTIAL', outcome: 'FAILED', occurredAt })
    .run();
const challenge = (id: string, createdAt: Date) =>
  db
    .insert(captchaChallenges)
    .values({
      id,
      purpose: 'login',
      answerMac: 'mac',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 120_000),
      ipKey: 'ip',
    })
    .run();
const event = (
  id: string,
  occurredAt: Date,
  severity: 'INFO' | 'WARNING' | 'CRITICAL' = 'INFO',
  acknowledged = false,
) => {
  const values: typeof securityEvents.$inferInsert = {
    id,
    type: 'ACCOUNT_LOCKED',
    severity,
    occurredAt,
    details: '{}',
    requestId: 'r',
  };
  if (acknowledged) {
    values.acknowledgedAt = occurredAt;
    values.acknowledgedBy = insertUser(db, { login: `ack-${id}` });
  }
  db.insert(securityEvents).values(values).run();
};
const ids = (table: typeof loginAttempts | typeof captchaChallenges | typeof securityEvents) =>
  (db.select({ id: table.id }).from(table).all() as { id: string }[]).map((r) => r.id).sort();

describe('purgeExpired', () => {
  it('removes login attempts older than 24 hours and keeps the rest', () => {
    attempt('old', ago(24 * HOUR + 1));
    attempt('edge', ago(24 * HOUR));
    attempt('recent', ago(23 * HOUR + 59 * 60_000));
    attempt('now', T0);

    const result = purgeExpired(db);

    expect(result.loginAttempts).toBe(1);
    expect(ids(loginAttempts)).toStrictEqual(['edge', 'now', 'recent']);
  });

  it('removes CAPTCHA challenges created more than 1 hour ago and keeps the rest', () => {
    challenge('old', ago(HOUR + 1));
    challenge('edge', ago(HOUR));
    challenge('recent', ago(59 * 60_000));

    const result = purgeExpired(db);

    expect(result.captchaChallenges).toBe(1);
    expect(ids(captchaChallenges)).toStrictEqual(['edge', 'recent']);
  });

  describe('security events, with the default retention of 90 days', () => {
    it.each(['INFO', 'WARNING'] as const)(
      'removes a %s event past the horizon, keeps a younger one',
      (severity) => {
        event('old', ago(90 * DAY + 1), severity);
        event('edge', ago(90 * DAY), severity);
        event('young', ago(89 * DAY), severity);

        const result = purgeExpired(db);

        expect(result.securityEvents).toBe(1);
        expect(ids(securityEvents)).toStrictEqual(['edge', 'young']);
      },
    );

    it('keeps an unacknowledged CRITICAL event past the horizon until it is twice as old', () => {
      event('critical-100d', ago(100 * DAY), 'CRITICAL');
      event('critical-179d', ago(180 * DAY - 1), 'CRITICAL');
      event('critical-181d', ago(180 * DAY + 1), 'CRITICAL');

      purgeExpired(db);

      expect(ids(securityEvents)).toStrictEqual(['critical-100d', 'critical-179d']);
    });

    it('treats an acknowledged CRITICAL event like any other', () => {
      event('acked-old', ago(91 * DAY), 'CRITICAL', true);
      event('acked-young', ago(10 * DAY), 'CRITICAL', true);
      event('unacked-old', ago(91 * DAY), 'CRITICAL');

      purgeExpired(db);

      expect(ids(securityEvents)).toStrictEqual(['acked-young', 'unacked-old']);
    });

    it('keeps an unacknowledged CRITICAL event younger than the horizon, of course', () => {
      event('fresh', ago(DAY), 'CRITICAL');

      expect(purgeExpired(db).securityEvents).toBe(0);
    });
  });

  it('follows security_event_retention_days, for the horizon and for the double horizon', () => {
    db.insert(securitySettings).values({ id: 1, securityEventRetentionDays: 7 }).run();
    event('info-8d', ago(8 * DAY));
    event('info-6d', ago(6 * DAY));
    event('crit-13d', ago(13 * DAY), 'CRITICAL');
    event('crit-15d', ago(15 * DAY), 'CRITICAL');

    purgeExpired(db);

    expect(ids(securityEvents)).toStrictEqual(['crit-13d', 'info-6d']);
  });

  it('uses the injected time rather than the clock', () => {
    attempt('a', ago(2 * DAY));

    expect(purgeExpired(db, new Date(T0.getTime() - 10 * DAY)).loginAttempts).toBe(0);
    expect(purgeExpired(db, T0).loginAttempts).toBe(1);
  });

  it('reports zero on empty tables and touches no other table', () => {
    insertUser(db, { login: 'ADMIN' });

    expect(purgeExpired(db)).toStrictEqual({
      loginAttempts: 0,
      captchaChallenges: 0,
      securityEvents: 0,
    });
    expect(db.$client.prepare('SELECT COUNT(*) AS n FROM users').get()).toStrictEqual({ n: 1 });
  });
});

describe('purgeIfDue', () => {
  it('runs the first time, then at most every 5 minutes', () => {
    attempt('a', ago(2 * DAY));
    expect(purgeIfDue(db)).toStrictEqual({
      loginAttempts: 1,
      captchaChallenges: 0,
      securityEvents: 0,
    });

    attempt('b', ago(2 * DAY));
    fakeClock.advance(PURGE_INTERVAL_MS - 1);
    expect(purgeIfDue(db)).toBeUndefined();
    expect(ids(loginAttempts)).toStrictEqual(['b']);

    fakeClock.advance(1);
    expect(purgeIfDue(db)).toMatchObject({ loginAttempts: 1 });
    expect(ids(loginAttempts)).toStrictEqual([]);
  });

  it('throttles each database on its own', () => {
    const other = createMigratedDb();
    try {
      purgeIfDue(db);

      expect(purgeIfDue(other)).toBeDefined();
      expect(purgeIfDue(db)).toBeUndefined();
    } finally {
      other.$client.close();
    }
  });

  it('never throws: a failing purge is reported as "did not run"', () => {
    const broken = createMigratedDb();
    broken.$client.close();

    expect(purgeIfDue(broken)).toBeUndefined();
  });
});
