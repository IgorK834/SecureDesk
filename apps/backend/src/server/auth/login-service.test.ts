import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { loginAttempts, securityEvents, securitySettings, sessions, users } from '../db/schema';
import { AccountLockedError } from '../http/errors';
import { ROLES } from '../permissions/codes';
import { verifyCaptchaOrThrow } from '../security/captcha';
import { setClockForTests } from '../time/clock';
import { authenticate } from './login-service';
import { getDummyHash, hashPassword, verifyPassword } from './password-hasher';
import { hashSessionToken } from './session-service';

// Wraps the real verification so calls can be counted: every attempt must cost exactly one.
// `getDummyHash` is wrapped too, to see which attempts ask for it.
vi.mock('./password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password-hasher')>();
  return {
    ...actual,
    verifyPassword: vi.fn(actual.verifyPassword),
    getDummyHash: vi.fn(actual.getDummyHash),
  };
});
vi.mock('../security/captcha', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../security/captcha')>();
  return { ...actual, verifyCaptchaOrThrow: vi.fn(() => Promise.resolve()) };
});

const PASSWORD = 'Correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const T0 = new Date('2026-03-10T12:00:00.000Z');

let db: AppDb;
let now: Date;
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  db = createMigratedDb();
  now = T0;
  setClockForTests({ now: () => now });
  vi.mocked(verifyPassword).mockClear();
  vi.mocked(getDummyHash).mockClear();
  vi.mocked(verifyCaptchaOrThrow).mockResolvedValue();
});

afterEach(() => {
  setClockForTests();
  vi.restoreAllMocks();
});

function addUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return insertUser(db, { login: 'employee1', passwordHash, ...overrides });
}

function attempt(login: string, password: string = PASSWORD, extra: { token?: string } = {}) {
  return authenticate(
    { login, password },
    {
      db,
      ip: '203.0.113.7',
      requestId: 'login-service-test',
      userAgent: 'vitest',
      presentedSessionToken: extra.token,
    },
  );
}

const sessionRows = () => db.select().from(sessions).all();

describe('refused logins (SEC-01, SEC-02)', () => {
  // Each way credentials can fail must be indistinguishable from the others, by result and by
  // cost: this is what stops the endpoint from being used to find out which accounts exist.
  const refusals: [string, () => { login: string; password: string }][] = [
    ['an unknown login', () => ({ login: 'nobody', password: PASSWORD })],
    [
      'a wrong password',
      () => {
        addUser();
        return { login: 'employee1', password: 'not the password' };
      },
    ],
    [
      'a blocked account, even with the right password',
      () => {
        addUser({ isBlocked: true });
        return { login: 'employee1', password: PASSWORD };
      },
    ],
    [
      'a soft-deleted account, even with the right password',
      () => {
        addUser({ deletedAt: T0 });
        return { login: 'employee1', password: PASSWORD };
      },
    ],
    [
      'an expired temporary password, even when it is the right one',
      () => {
        addUser({
          mustChangePassword: true,
          temporaryPasswordExpiresAt: new Date(T0.getTime() - 1),
        });
        return { login: 'employee1', password: PASSWORD };
      },
    ],
  ];

  it.each(refusals)(
    '%s gives the generic result, one Argon2 verification and no session',
    async (_, prepare) => {
      const { login, password } = prepare();

      const result = await attempt(login, password);

      expect(result).toStrictEqual({ outcome: 'invalid_credentials' });
      expect(verifyPassword).toHaveBeenCalledTimes(1);
      expect(sessionRows()).toHaveLength(0);
    },
  );

  it('verifies an unknown login against the dummy hash, so it takes as long as a real one', async () => {
    await attempt('nobody');

    expect(vi.mocked(verifyPassword).mock.calls[0]?.[0]).toBe(await getDummyHash());
  });

  // The dummy hash is computed on its first use, and that costs one more Argon2 hash than a
  // verification does. If only unknown logins asked for it, the first attempt after a restart
  // would be slower exactly when the login does not exist, which is what it is there to hide.
  it.each([
    ['an unknown login', 'nobody', PASSWORD],
    ['a known login with a wrong password', 'employee1', 'not the password'],
    ['a known login with the right password', 'employee1', PASSWORD],
  ])(
    '%s asks for the dummy hash too, so the first attempt costs the same',
    async (_, login, password) => {
      addUser();

      await attempt(login, password);

      expect(getDummyHash).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["' OR '1'='1", "admin'--", "employee1' --", "'; DROP TABLE users; --", '" OR ""="'])(
    'treats the login %j as plain text: no match, no error, nothing damaged',
    async (login) => {
      addUser({ login: 'ADMIN' });

      const result = await attempt(login, "' OR '1'='1");

      expect(result).toStrictEqual({ outcome: 'invalid_credentials' });
      expect(db.select().from(users).all()).toHaveLength(1);
      expect(sessionRows()).toHaveLength(0);
    },
  );

  it('never trims or normalizes the password', async () => {
    addUser({ passwordHash: await hashPassword(' padded caf\u00e9 ') });

    expect(await attempt('employee1', ' padded caf\u00e9 ')).toMatchObject({
      outcome: 'authenticated',
    });
    expect(await attempt('employee1', 'padded caf\u00e9')).toStrictEqual({
      outcome: 'invalid_credentials',
    });
    expect(await attempt('employee1', ' padded cafe\u0301 ')).toStrictEqual({
      outcome: 'invalid_credentials',
    });
  });

  it('refuses a stored hash that is not Argon2id instead of failing open or crashing', async () => {
    addUser({ passwordHash: 'plaintext-password-stored-by-mistake' });

    expect(await attempt('employee1', 'plaintext-password-stored-by-mistake')).toStrictEqual({
      outcome: 'invalid_credentials',
    });
  });
});

describe('a valid login', () => {
  it('returns a fully authenticated session and only the allowed user fields', async () => {
    const id = addUser({ firstName: 'Jan', lastName: 'Kowalski' });

    const result = await attempt('employee1');

    expect(result).toStrictEqual({
      outcome: 'authenticated',
      user: { id, login: 'employee1', firstName: 'Jan', lastName: 'Kowalski', role: 'EMPLOYEE' },
      authStage: 'FULLY_AUTHENTICATED',
      mustChangePassword: false,
      session: { id: expect.any(String), token: expect.any(String), expiresAt: expect.any(Date) },
    });
    expect(vi.mocked(verifyPassword)).toHaveBeenCalledTimes(1);
  });

  it.each(Object.entries(ROLES))('reports the %s role as its upper-case code', async (code, id) => {
    addUser({ roleId: id });

    const result = await attempt('employee1');

    expect(result).toMatchObject({ user: { role: code } });
  });

  it.each(['EMPLOYEE1', 'Employee1', '\uFF45\uFF4D\uFF50\uFF4C\uFF4F\uFF59\uFF45\uFF45\uFF11'])(
    'finds the account whatever the letter case or Unicode form of the login (%s)',
    async (typed) => {
      const id = addUser();

      expect(await attempt(typed)).toMatchObject({ outcome: 'authenticated', user: { id } });
    },
  );

  it('keeps the login as it was created, whatever the user typed', async () => {
    addUser({ login: 'ADMIN' });

    expect(await attempt('admin')).toMatchObject({ user: { login: 'ADMIN' } });
  });

  it('stores the session under a digest of its token, never the token itself', async () => {
    const id = addUser();

    const result = await attempt('employee1');

    if (result.outcome !== 'authenticated') throw new Error('expected a session');
    expect(sessionRows()).toHaveLength(1);
    expect(sessionRows()[0]).toMatchObject({
      userId: id,
      tokenHash: hashSessionToken(result.session.token),
      authStage: 'FULLY_AUTHENTICATED',
    });
    expect(JSON.stringify(sessionRows())).not.toContain(result.session.token);
  });

  it('never carries the password hash into the result', async () => {
    addUser();

    const result = await attempt('employee1');

    expect(JSON.stringify(result)).not.toContain(passwordHash);
    expect(JSON.stringify(result)).not.toContain('$argon2');
  });
});

describe('temporary passwords (valid for 12 hours)', () => {
  const issueTemporaryPassword = (overrides: Partial<typeof users.$inferInsert> = {}) =>
    addUser({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(T0.getTime() + 12 * HOUR_MS),
      ...overrides,
    });

  it('opens a restricted INITIAL_PASSWORD_CHANGE session at 11 h 59 min', async () => {
    issueTemporaryPassword();
    now = new Date(T0.getTime() + 11 * HOUR_MS + 59 * 60 * 1000);

    const result = await attempt('employee1');

    expect(result).toMatchObject({
      outcome: 'authenticated',
      authStage: 'INITIAL_PASSWORD_CHANGE',
      mustChangePassword: true,
    });
    expect(sessionRows()[0]?.authStage).toBe('INITIAL_PASSWORD_CHANGE');
  });

  it('is refused from the very instant it expires, not one tick later', async () => {
    issueTemporaryPassword();

    now = new Date(T0.getTime() + 12 * HOUR_MS - 1);
    expect(await attempt('employee1')).toMatchObject({ outcome: 'authenticated' });

    now = new Date(T0.getTime() + 12 * HOUR_MS);
    expect(await attempt('employee1')).toStrictEqual({ outcome: 'invalid_credentials' });

    now = new Date(T0.getTime() + 13 * HOUR_MS);
    expect(await attempt('employee1')).toStrictEqual({ outcome: 'invalid_credentials' });
  });

  it('has no deadline when the expiry is NULL, like the seeded ADMIN bootstrap password', async () => {
    issueTemporaryPassword({ temporaryPasswordExpiresAt: null });
    now = new Date(T0.getTime() + 400 * DAY_MS);

    expect(await attempt('employee1')).toMatchObject({
      outcome: 'authenticated',
      authStage: 'INITIAL_PASSWORD_CHANGE',
    });
  });

  it('is not held against an account that has already chosen its own password', async () => {
    // A leftover expiry on an account that no longer must change its password is not a deadline.
    addUser({
      mustChangePassword: false,
      temporaryPasswordExpiresAt: new Date(T0.getTime() - DAY_MS),
    });

    expect(await attempt('employee1')).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
  });
});

describe('password expiry (password_max_age_days)', () => {
  const setMaxAge = (days: number | null) =>
    db.insert(securitySettings).values({ id: 1, passwordMaxAgeDays: days }).run();
  const changedAgo = (ms: number) => new Date(T0.getTime() - ms);

  it('requires a password change once the password is older than the limit, not before', async () => {
    setMaxAge(90);
    addUser({ passwordChangedAt: changedAgo(90 * DAY_MS) });
    expect(await attempt('employee1')).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });

    db.update(users)
      .set({ passwordChangedAt: changedAgo(90 * DAY_MS + 1) })
      .run();
    expect(await attempt('employee1')).toMatchObject({
      outcome: 'authenticated',
      authStage: 'PASSWORD_EXPIRED',
      mustChangePassword: false,
    });
    expect(sessionRows().at(-1)?.authStage).toBe('PASSWORD_EXPIRED');
  });

  it('never expires passwords while the limit is disabled (NULL)', async () => {
    setMaxAge(null);
    addUser({ passwordChangedAt: changedAgo(5000 * DAY_MS) });

    expect(await attempt('employee1')).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
  });

  it('treats a missing settings row as "expiry disabled"', async () => {
    addUser({ passwordChangedAt: changedAgo(5000 * DAY_MS) });

    expect(await attempt('employee1')).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
  });

  it('cannot prove a password fresh when no change date is recorded, so it counts as expired', async () => {
    setMaxAge(90);
    addUser({ passwordChangedAt: null });

    expect(await attempt('employee1')).toMatchObject({ authStage: 'PASSWORD_EXPIRED' });
  });

  it('puts the first-login change ahead of expiry: a temporary password is changed first', async () => {
    setMaxAge(90);
    addUser({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(T0.getTime() + HOUR_MS),
      passwordChangedAt: changedAgo(1000 * DAY_MS),
    });

    expect(await attempt('employee1')).toMatchObject({ authStage: 'INITIAL_PASSWORD_CHANGE' });
  });
});

describe('session fixation', () => {
  it('revokes the session cookie the request carried and issues a different token', async () => {
    addUser();
    const first = await attempt('employee1');
    if (first.outcome !== 'authenticated') throw new Error('expected a session');

    const second = await attempt('employee1', PASSWORD, { token: first.session.token });

    if (second.outcome !== 'authenticated') throw new Error('expected a session');
    expect(second.session.token).not.toBe(first.session.token);
    const byDigest = new Map(sessionRows().map((row) => [row.tokenHash, row]));
    expect(byDigest.get(hashSessionToken(first.session.token))?.revokedAt).not.toBeNull();
    expect(byDigest.get(hashSessionToken(second.session.token))?.revokedAt).toBeNull();
  });

  it('is not tripped up by a cookie that matches no session', async () => {
    addUser();

    expect(await attempt('employee1', PASSWORD, { token: 'forged' })).toMatchObject({
      outcome: 'authenticated',
    });
  });
});

describe('persistent account lockout', () => {
  it('uses the administrator-configured failure threshold', async () => {
    db.insert(securitySettings).values({ id: 1, maxFailedLoginAttempts: 3 }).run();
    addUser();

    await expect(attempt('employee1', 'wrong')).resolves.toStrictEqual({
      outcome: 'invalid_credentials',
    });
    await expect(attempt('employee1', 'wrong')).resolves.toStrictEqual({
      outcome: 'invalid_credentials',
    });
    await expect(attempt('employee1', 'wrong')).rejects.toMatchObject({
      code: 'AUTH_ACCOUNT_LOCKED',
      details: { retryAfterSeconds: 900 },
    });
  });

  it('SEC-31 and SEC-39: locks on the fifth failure without changing the account block flag', async () => {
    addUser();

    for (let count = 1; count < 5; count++) {
      await expect(attempt('employee1', 'wrong')).resolves.toStrictEqual({
        outcome: 'invalid_credentials',
      });
    }
    await expect(attempt('employee1', 'wrong')).rejects.toMatchObject({
      status: 429,
      code: 'AUTH_ACCOUNT_LOCKED',
      details: {
        lockedUntil: '2026-03-10T12:15:00.000Z',
        retryAfterSeconds: 900,
      },
    });

    expect(db.select().from(securityEvents).all()).toMatchObject([
      { type: 'ACCOUNT_LOCKED', details: expect.stringContaining('2026-03-10T12:15:00.000Z') },
    ]);
    expect(db.select().from(users).get()?.isBlocked).toBe(false);

    db.update(users).set({ isBlocked: true }).run();
    db.update(users).set({ isBlocked: false }).run();
    await expect(attempt('employee1')).rejects.toBeInstanceOf(AccountLockedError);
  });

  it('SEC-32: remains locked at 14:59 and accepts a reservation at exactly 15:00', async () => {
    addUser();
    for (let count = 0; count < 5; count++) {
      await attempt('employee1', 'wrong').catch(() => undefined);
    }

    now = new Date(T0.getTime() + 14 * 60 * 1000 + 59 * 1000);
    await expect(attempt('employee1')).rejects.toBeInstanceOf(AccountLockedError);
    now = new Date(T0.getTime() + 15 * 60 * 1000);
    await expect(attempt('employee1')).resolves.toMatchObject({ outcome: 'authenticated' });
  });

  it('SEC-33: refuses the correct password during a lock without moving its end', async () => {
    addUser();
    for (let count = 0; count < 5; count++) {
      await attempt('employee1', 'wrong').catch(() => undefined);
    }

    now = new Date(T0.getTime() + 60_000);
    await expect(attempt('employee1')).rejects.toMatchObject({
      details: { lockedUntil: '2026-03-10T12:15:00.000Z', retryAfterSeconds: 840 },
    });
    expect(verifyPassword).toHaveBeenCalledTimes(5);
  });

  it('SEC-35: a successful login resets the failed-attempt counter', async () => {
    addUser();
    for (let count = 0; count < 4; count++) await attempt('employee1', 'wrong');

    await expect(attempt('employee1')).resolves.toMatchObject({ outcome: 'authenticated' });
    for (let count = 0; count < 4; count++) {
      await expect(attempt('employee1', 'wrong')).resolves.toStrictEqual({
        outcome: 'invalid_credentials',
      });
    }
  });

  it('SEC-36: fifty parallel failures start at most five credential verifications', async () => {
    addUser();

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => attempt('employee1', 'wrong')),
    );

    expect(verifyPassword).toHaveBeenCalledTimes(5);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(46);
    expect(db.select().from(loginAttempts).all()).toHaveLength(5);
  });
});
