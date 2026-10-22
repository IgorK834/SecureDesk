import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { securitySettings, sessions, users } from '../db/schema';
import { ROLES } from '../permissions/codes';
import { loginRateLimiter } from '../security/login-rate-limiter';
import { setClockForTests } from '../time/clock';
import { authenticate } from './login-service';
import { getDummyHash, hashPassword, verifyPassword } from './password-hasher';
import { hashSessionToken } from './session-service';

// Wraps the real verification so calls can be counted: every attempt must cost exactly one.
vi.mock('./password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password-hasher')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
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
    { db, clientKey: '203.0.113.7', presentedSessionToken: extra.token },
  );
}

const sessionRows = () => db.select().from(sessions).all();

describe('refused logins', () => {
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
      session: { token: expect.any(String), expiresAt: expect.any(Date) },
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

describe('rate limiting hook', () => {
  it('lets every attempt through until a real limiter replaces the placeholder', async () => {
    await expect(loginRateLimiter.check('any', 'any')).resolves.toStrictEqual({ allowed: true });
  });

  it('is asked about the client and the normalized login before any password work happens', async () => {
    const check = vi.spyOn(loginRateLimiter, 'check');
    addUser();

    await attempt('EMPLOYEE1');

    expect(check).toHaveBeenCalledExactlyOnceWith('203.0.113.7', 'employee1');
    expect(check.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(verifyPassword).mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('refuses a throttled attempt without verifying anything, even with the right password', async () => {
    vi.spyOn(loginRateLimiter, 'check').mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
    addUser();

    const result = await attempt('employee1');

    expect(result).toStrictEqual({ outcome: 'rate_limited', retryAfterSeconds: 42 });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(sessionRows()).toHaveLength(0);
  });
});
