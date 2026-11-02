import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import { createDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { loginAttempts, securityEvents } from '../db/schema';
import { setClockForTests } from '../time/clock';
import {
  checkIpBlock,
  clearAccount,
  clearIpBlock,
  recordIpFailure,
  reserveCredentialAttempt,
  resolveAttempt,
} from './attempt-tracker';

const T0 = new Date('2026-03-10T12:00:00.000Z');
const input = (now = T0) => ({
  loginNormalized: 'admin',
  ipKey: '203.0.113.7',
  now,
  maxAttempts: 5,
});
const context = (now = T0) => ({
  now,
  maxAttempts: 5,
  requestId: 'request-id',
  userAgent: 'vitest',
});

const temporaryDirectories: string[] = [];
beforeEach(() => setClockForTests({ now: () => T0 }));
afterEach(() => {
  setClockForTests();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('persistent credential-attempt tracker', () => {
  it('reserves synchronously, locks on the fifth resolved failure and keeps append-only rows', () => {
    const db = createMigratedDb();

    for (let count = 1; count <= 5; count++) {
      const reservation = reserveCredentialAttempt(db, input());
      expect(reservation.status).toBe('reserved');
      if (reservation.status !== 'reserved') throw new Error('expected reservation');
      const result = resolveAttempt(db, reservation.attemptId, 'FAILED', context());
      expect(result.lockedUntil).toStrictEqual(
        count === 5 ? new Date('2026-03-10T12:15:00.000Z') : undefined,
      );
    }

    expect(reserveCredentialAttempt(db, input())).toStrictEqual({
      status: 'locked',
      lockedUntil: new Date('2026-03-10T12:15:00.000Z'),
    });
    expect(db.select().from(loginAttempts).all()).toHaveLength(5);
  });

  it('uses SUCCESS and CLEARED rows as reset boundaries, even at the same clock tick', () => {
    const db = createMigratedDb();
    const fail = () => {
      const reservation = reserveCredentialAttempt(db, input());
      if (reservation.status !== 'reserved') throw new Error('expected reservation');
      resolveAttempt(db, reservation.attemptId, 'FAILED', context());
    };
    for (let count = 0; count < 4; count++) fail();

    const success = reserveCredentialAttempt(db, input());
    if (success.status !== 'reserved') throw new Error('expected reservation');
    resolveAttempt(db, success.attemptId, 'SUCCESS', context());
    for (let count = 0; count < 4; count++) fail();
    clearAccount(db, 'admin', T0);

    expect(reserveCredentialAttempt(db, input()).status).toBe('reserved');
    expect(db.select().from(loginAttempts).all().at(-2)).toMatchObject({
      kind: 'MARKER',
      outcome: 'CLEARED',
    });
  });

  it('SEC-59: preserves an active lock after closing and reopening the database', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'securedesk-lock-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'test.sqlite');
    const first = createDb(databasePath);
    runMigrations(first);
    for (let count = 0; count < 5; count++) {
      const reservation = reserveCredentialAttempt(first, input());
      if (reservation.status !== 'reserved') throw new Error('expected reservation');
      resolveAttempt(first, reservation.attemptId, 'FAILED', context());
    }
    first.$client.close();

    const reopened = createDb(databasePath);
    expect(reserveCredentialAttempt(reopened, input())).toMatchObject({
      status: 'locked',
      lockedUntil: new Date('2026-03-10T12:15:00.000Z'),
    });
    reopened.$client.close();
  });
});

describe('persistent address-attempt tracker', () => {
  const fail = (
    db: ReturnType<typeof createMigratedDb>,
    login: string,
    ipKey: string,
    now = T0,
  ) => {
    const reservation = reserveCredentialAttempt(db, {
      loginNormalized: login,
      ipKey,
      now,
      maxAttempts: 5,
    });
    if (reservation.status !== 'reserved') throw new Error('expected reservation');
    resolveAttempt(db, reservation.attemptId, 'FAILED', {
      ...context(now),
      sprayingDistinctLoginThreshold: 8,
    });
  };

  it('SEC-55: blocks after 20 failures across distinct logins and leaves another address alone', () => {
    const db = createMigratedDb();
    for (let count = 0; count < 20; count++) fail(db, `login-${count}`, '203.0.113.7');

    expect(
      checkIpBlock(db, {
        ipKey: '203.0.113.7',
        now: T0,
        limit: 20,
        requestId: 'blocked-request',
      }),
    ).toStrictEqual({
      ipKey: '203.0.113.7',
      failedAttempts: 20,
      lockedUntil: new Date('2026-03-10T12:15:00.000Z'),
    });
    expect(
      checkIpBlock(db, {
        ipKey: '203.0.113.8',
        now: T0,
        limit: 20,
        requestId: 'other-request',
      }),
    ).toBeUndefined();
  });

  it('counts CAPTCHA and honeypot failures, ignores successful logins, and an IP clear resets it', () => {
    const db = createMigratedDb();
    for (let count = 0; count < 18; count++) fail(db, `success-${count}`, '203.0.113.7');

    const success = reserveCredentialAttempt(db, {
      ...input(),
      loginNormalized: 'successful-login',
    });
    if (success.status !== 'reserved') throw new Error('expected reservation');
    resolveAttempt(db, success.attemptId, 'SUCCESS', context());
    recordIpFailure(db, { ipKey: '203.0.113.7', kind: 'CAPTCHA', now: T0 });
    recordIpFailure(db, { ipKey: '203.0.113.7', kind: 'HONEYPOT', now: T0 });

    expect(
      checkIpBlock(db, {
        ipKey: '203.0.113.7',
        now: T0,
        limit: 20,
        requestId: 'blocked-request',
      })?.failedAttempts,
    ).toBe(20);
    clearIpBlock(db, '203.0.113.7', T0);
    expect(
      checkIpBlock(db, {
        ipKey: '203.0.113.7',
        now: T0,
        limit: 20,
        requestId: 'cleared-request',
      }),
    ).toBeUndefined();
  });

  it('SEC-57: records exactly one spraying event for an address in each five-minute bucket', () => {
    const db = createMigratedDb();
    for (let count = 0; count < 9; count++) fail(db, `spray-${count}`, '203.0.113.7');

    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .filter((event) => event.type === 'PASSWORD_SPRAYING_SUSPECTED'),
    ).toHaveLength(1);

    const nextBucket = new Date(T0.getTime() + 5 * 60 * 1000);
    setClockForTests({ now: () => nextBucket });
    fail(db, 'spray-next-bucket', '203.0.113.7', nextBucket);

    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .filter((event) => event.type === 'PASSWORD_SPRAYING_SUSPECTED'),
    ).toHaveLength(2);
  });

  it('SEC-59: preserves an address block after closing and reopening the database', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'securedesk-ip-block-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'test.sqlite');
    const first = createDb(databasePath);
    runMigrations(first);
    for (let count = 0; count < 20; count++) fail(first, `login-${count}`, '203.0.113.7');
    first.$client.close();

    const reopened = createDb(databasePath);
    expect(
      checkIpBlock(reopened, {
        ipKey: '203.0.113.7',
        now: T0,
        limit: 20,
        requestId: 'after-restart',
      }),
    ).toMatchObject({ failedAttempts: 20 });
    reopened.$client.close();
  });
});
