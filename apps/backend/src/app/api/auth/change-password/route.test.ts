import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../../../../server/auth/cookie';
import { hashPassword, verifyPassword } from '../../../../server/auth/password-hasher';
import {
  createSession,
  hashSessionToken,
  resolveSession,
} from '../../../../server/auth/session-service';
import { captureOutput } from '../../../../server/__fixtures__/capture-output';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import {
  type AuthStage,
  passwordHistory,
  securitySettings,
  sessions,
  users,
} from '../../../../server/db/schema';
import { csrfTokenForSession } from '../../../../server/security/csrf';
import { POST as login } from '../login/route';
import { GET as me } from '../me/route';
import { POST, dynamic, runtime } from './route';

// These tests drive the real route handler, the real guards, the real Argon2id hashing and the
// in-memory test database: what is asserted is what a client can observe over HTTP, plus the
// state the database is left in.

// Wrappers around the real functions: the hasher so a test can see how many requests got past
// every check, the session service so a test can make the last step of the transaction fail.
vi.mock('../../../../server/auth/password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/auth/password-hasher')>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});
vi.mock('../../../../server/auth/session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/auth/session-service')>();
  return { ...actual, createSession: vi.fn(actual.createSession) };
});

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const COOKIE = '__Host-sd_session';
const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';

// Distinct, policy-compliant passwords: P[0] is the account's password at the start.
const P = Array.from({ length: 8 }, (_, n) => `Regular password number ${n}`);
const CURRENT = P[0] as string;
const NEW_PASSWORD = 'A brand new passphrase 1';

let currentHash: string;
let userId: string;
const fakeClock = new FakeClock(T0);

beforeAll(async () => {
  currentHash = await hashPassword(CURRENT);
});

setUpSharedTestDb();

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  userId = insertUser(db, {
    login: 'employee1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    passwordHash: currentHash,
    passwordChangedAt: new Date(T0.getTime() - DAY_MS),
  });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(hashPassword).mockClear();
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const open = (stage: AuthStage = 'FULLY_AUTHENTICATED') => createSession(db, userId, stage);
const cookieHeader = (token: string) => `${sessionCookieName()}=${token}`;
const csrfFor = (token: string) => {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .get();
  return session ? csrfTokenForSession(session.id) : undefined;
};

function change(token: string | undefined, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/api/auth/change-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...(token === undefined ? {} : { cookie: cookieHeader(token) }),
        ...(token === undefined || csrfFor(token) === undefined
          ? {}
          : { 'x-xsrf-token': csrfFor(token) as string }),
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const valid = (overrides: Record<string, unknown> = {}) => ({
  currentPassword: CURRENT,
  newPassword: NEW_PASSWORD,
  confirmNewPassword: NEW_PASSWORD,
  ...overrides,
});

const whoAmI = (token: string) =>
  me(
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: { cookie: cookieHeader(token) },
    }),
  );

function logIn(password: string) {
  return login(
    new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({ login: 'employee1', password }),
    }),
  );
}

/** The value of the session cookie a response sets. */
function cookieValue(response: Response): string {
  const header = response.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
  return header?.split(';')[0]?.slice(COOKIE.length + 1) ?? '';
}

/** Everything that holds a credential, whole rows: "unchanged" means byte-identical. */
const credentials = () => ({
  users: db.select().from(users).all(),
  history: db.select().from(passwordHistory).all(),
});

const historyRows = () =>
  db.select().from(passwordHistory).where(eq(passwordHistory.userId, userId)).all();
const userRow = () => db.select().from(users).where(eq(users.id, userId)).get();

describe('POST /api/auth/change-password: success', () => {
  it('answers 200 with the profile and the stage, sets a fresh cookie and leaks neither hash nor token', async () => {
    const { token } = open();
    fakeClock.advance(MINUTE_MS);

    const response = await change(token, valid());
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toStrictEqual({
      user: {
        id: userId,
        login: 'employee1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        role: 'EMPLOYEE',
      },
      authStage: 'FULLY_AUTHENTICATED',
    });
    expect(text).not.toMatch(/hash|token|argon2|\$/i);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE}=`)) ?? '';
    const xsrfCookie = cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN=')) ?? '';
    expect(sessionCookie).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(xsrfCookie).toMatch(/^XSRF-TOKEN=[A-Za-z0-9_-]{43};/);
    const attributes = sessionCookie.split(';').map((part) => part.trim().toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(text).not.toContain(cookieValue(response));
    expect(cookieValue(response)).not.toBe(token);
  });

  it('stores the new password only as an Argon2id hash and retires the old one', async () => {
    const { token } = open();
    fakeClock.advance(MINUTE_MS);

    await change(token, valid());

    const row = userRow();
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toContain(NEW_PASSWORD);
    expect(await verifyPassword(row?.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
    expect(await verifyPassword(row?.passwordHash ?? '', CURRENT)).toBe(false);
    expect(row?.passwordChangedAt).toStrictEqual(new Date(T0.getTime() + MINUTE_MS));
    expect(row?.mustChangePassword).toBe(false);
    expect(historyRows().map((r) => r.passwordHash)).toStrictEqual([currentHash]);
    expect(JSON.stringify(credentials())).not.toContain(NEW_PASSWORD);
  });

  it('lets the user sign in with the new password and no longer with the old one', async () => {
    await change(open().token, valid());

    expect((await logIn(NEW_PASSWORD)).status).toBe(200);
    expect((await logIn(CURRENT)).status).toBe(401);
  });

  it('revokes every older session of the user: the old cookie answers 401, the new one works', async () => {
    const used = open();
    const otherDevice = open();

    const response = await change(used.token, valid());

    for (const old of [used, otherDevice]) {
      const refused = await whoAmI(old.token);
      expect(refused.status).toBe(401);
      expect(await refused.text()).toBe(NOT_SIGNED_IN);
      expect(resolveSession(db, old.token)).toBeNull();
    }
    const fresh = await whoAmI(cookieValue(response));
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
  });

  it("does not touch another user's sessions", async () => {
    const colleague = insertUser(db, { login: 'employee2' });
    const colleagueSession = createSession(db, colleague, 'FULLY_AUTHENTICATED');

    await change(open().token, valid());

    expect(resolveSession(db, colleagueSession.token)).not.toBeNull();
  });
});

describe('POST /api/auth/change-password: an expired password (PASSWORD_EXPIRED)', () => {
  it('turns the restricted session into a fully authenticated one', async () => {
    const { token } = open('PASSWORD_EXPIRED');

    const response = await change(token, valid());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
    const fresh = await whoAmI(cookieValue(response));
    expect(await fresh.json()).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
    expect(resolveSession(db, token)).toBeNull();
  });

  it('still requires the current password in that stage', async () => {
    const { token } = open('PASSWORD_EXPIRED');
    const before = credentials();

    const response = await change(token, valid({ currentPassword: 'not the password' }));

    expect(response.status).toBe(400);
    expect(credentials()).toStrictEqual(before);
    expect(resolveSession(db, token)?.session.authStage).toBe('PASSWORD_EXPIRED');
  });

  it('ends the expiry for real: after the change the next login is no longer PASSWORD_EXPIRED', async () => {
    db.insert(securitySettings).values({ id: 1, passwordMaxAgeDays: 90 }).run();
    db.update(users)
      .set({ passwordChangedAt: new Date(T0.getTime() - 91 * DAY_MS) })
      .where(eq(users.id, userId))
      .run();
    const expired = await logIn(CURRENT);
    expect(await expired.json()).toMatchObject({ authStage: 'PASSWORD_EXPIRED' });

    await change(cookieValue(expired), valid());

    const next = await logIn(NEW_PASSWORD);
    expect(await next.json()).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
  });
});

describe('POST /api/auth/change-password: who may call it', () => {
  it.each([
    ['no cookie', undefined],
    ['a malformed token', 'not-a-token'],
    ['a token that was never issued', 'A'.repeat(43)],
  ])('answers 401 AUTH_REQUIRED for %s and changes nothing', async (_, token) => {
    const before = credentials();

    const response = await change(token, valid());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
  });

  it('answers 403 AUTH_PASSWORD_CHANGE_REQUIRED to a session that still has to make the initial change', async () => {
    const { token } = open('INITIAL_PASSWORD_CHANGE');
    const before = credentials();

    const response = await change(token, valid());

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED', message: 'Wymagana zmiana hasła' },
    });
    expect(credentials()).toStrictEqual(before);
    expect(resolveSession(db, token)).not.toBeNull();
  });

  it('checks the session before it looks at the body, so an anonymous caller learns nothing about validation', async () => {
    const response = await change(undefined, '{not json');

    expect(response.status).toBe(401);
  });
});

describe('POST /api/auth/change-password: the current password (SEC-13)', () => {
  it('rejects a wrong one with 400 CURRENT_PASSWORD_INCORRECT and leaves every credential byte-identical', async () => {
    const { token } = open();
    const before = credentials();

    const response = await change(token, valid({ currentPassword: 'not the password' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'Obecne hasło jest niepoprawne' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(db.select().from(passwordHistory).all()).toHaveLength(0);
  });

  it('keeps the session alive after a wrong current password: nothing was revoked', async () => {
    const { token } = open();

    await change(token, valid({ currentPassword: 'not the password' }));

    expect(resolveSession(db, token)).not.toBeNull();
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('reports the wrong current password even when the new password is also bad, so nothing else is revealed first', async () => {
    const response = await change(
      open().token,
      valid({ currentPassword: 'not the password', newPassword: 'x', confirmNewPassword: 'y' }),
    );

    expect((await response.json()).error.code).toBe('CURRENT_PASSWORD_INCORRECT');
  });
});

describe('POST /api/auth/change-password: server-side policy, whatever the client checked', () => {
  async function violationsFor(newPassword: string) {
    const before = credentials();
    const response = await change(
      open().token,
      valid({ newPassword, confirmNewPassword: newPassword }),
    );
    expect(credentials()).toStrictEqual(before);
    return { response, body: await response.json() };
  }

  it.each([
    ['an 11-character password', 'qpwoeirutya', ['TOO_SHORT']],
    ['an empty password', '', ['TOO_SHORT']],
    ['129 characters', 'a'.repeat(129), ['TOO_LONG']],
    ['a very common password', 'password1234', ['COMMON_PASSWORD']],
  ])(
    'answers 400 PASSWORD_POLICY_VIOLATION with the violation code for %s',
    async (_, password, expected) => {
      const { response, body } = await violationsFor(password);

      expect(response.status).toBe(400);
      expect(body).toStrictEqual({
        error: {
          code: 'PASSWORD_POLICY_VIOLATION',
          message: 'Hasło nie spełnia wymagań bezpieczeństwa',
          details: { violations: expected },
        },
      });
      expect(response.headers.getSetCookie()).toHaveLength(0);
    },
  );

  it('rejects the account holder’s own first name in any case when the administrator turned the rule on (SEC-11)', async () => {
    db.insert(securitySettings).values({ id: 1, rejectPersonalDataInPassword: true }).run();

    const { response, body } = await violationsFor('MyJANpassphrase 2026');

    expect(response.status).toBe(400);
    expect(body.error.details).toStrictEqual({ violations: ['CONTAINS_FIRST_NAME'] });
    // The client is told which rule, never the profile value it matched.
    expect(JSON.stringify(body)).not.toMatch(/jan|kowalski|employee1/i);
  });

  it('does not apply that rule while it is off (SEC-12)', async () => {
    const response = await change(
      open().token,
      valid({ newPassword: 'MyJANpassphrase 2026', confirmNewPassword: 'MyJANpassphrase 2026' }),
    );

    expect(response.status).toBe(200);
  });

  it('honours a raised minimum length from the settings', async () => {
    db.insert(securitySettings).values({ id: 1, minPasswordLength: 30 }).run();

    const { body } = await violationsFor(NEW_PASSWORD);

    expect(body.error.details).toStrictEqual({ violations: ['TOO_SHORT'] });
  });

  it('refuses a mismatching confirmation with a field error and changes nothing', async () => {
    const before = credentials();

    const response = await change(
      open().token,
      valid({ confirmNewPassword: 'A different one 123' }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Nieprawidłowe dane żądania',
        details: { fieldErrors: { confirmNewPassword: 'PASSWORDS_DO_NOT_MATCH' } },
      },
    });
    expect(credentials()).toStrictEqual(before);
  });
});

describe('POST /api/auth/change-password: password history (SEC-14)', () => {
  it('refuses the current password as the new one', async () => {
    const before = credentials();

    const response = await change(
      open().token,
      valid({ newPassword: CURRENT, confirmNewPassword: CURRENT }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('PASSWORD_REUSED');
    expect(credentials()).toStrictEqual(before);
  });

  it('remembers exactly five previous passwords: each is refused, the sixth-oldest is accepted again', async () => {
    let token = open().token;
    for (let n = 1; n <= 7; n++) {
      fakeClock.advance(MINUTE_MS); // distinct dates, as in real life where a change takes time
      const response = await change(token, {
        currentPassword: P[n - 1],
        newPassword: P[n],
        confirmNewPassword: P[n],
      });
      expect(response.status, `change to password ${n}`).toBe(200);
      token = cookieValue(response);
    }

    const rows = historyRows();
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.passwordHash.startsWith('$argon2id$'))).toBe(true);
    // Password 7 is current; 6 down to 2 are the five previous ones.
    for (const n of [7, 6, 5, 4, 3, 2]) {
      const response = await change(token, {
        currentPassword: P[7],
        newPassword: P[n],
        confirmNewPassword: P[n],
      });
      expect(response.status, `password ${n}`).toBe(400);
      expect((await response.json()).error.code, `password ${n}`).toBe('PASSWORD_REUSED');
    }
    const sixthOldest = await change(token, {
      currentPassword: P[7],
      newPassword: P[1],
      confirmNewPassword: P[1],
    });
    expect(sixthOldest.status).toBe(200);
  });
});

describe('POST /api/auth/change-password: malformed requests', () => {
  const bad: [string, unknown][] = [
    ['an empty body', ''],
    ['text that is not JSON', 'currentPassword=a'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['an empty object', {}],
    ['a missing current password', { newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD }],
    ['a missing confirmation', { currentPassword: CURRENT, newPassword: NEW_PASSWORD }],
    ['an empty current password', valid({ currentPassword: '' })],
    ['a numeric new password', valid({ newPassword: 123 })],
    ['an object as the new password', valid({ newPassword: { $ne: '' } })],
    ['an extra key', valid({ role: 'ADMINISTRATOR' })],
    ['a 1025-character new password', valid({ newPassword: 'p'.repeat(1025) })],
  ];

  it.each(bad)('rejects %s with 400 VALIDATION_ERROR and changes nothing', async (_, body) => {
    const { token } = open();
    const before = credentials();

    const response = await change(token, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Nieprawidłowe dane żądania' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(resolveSession(db, token)).not.toBeNull();
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['a form encoding', 'application/x-www-form-urlencoded'],
    ['an empty Content-Type', ''],
  ])(
    'refuses valid input sent as %s, which a cross-site form could send',
    async (_, contentType) => {
      const before = credentials();

      const response = await change(open().token, valid(), { 'content-type': contentType });

      expect(response.status).toBe(415);
      expect(credentials()).toStrictEqual(before);
    },
  );
});

describe('POST /api/auth/change-password: all or nothing', () => {
  it('rolls back the hash, the history and the revocations when the last step of the transaction fails', async () => {
    const used = open();
    const otherDevice = open();
    const before = credentials();
    let seenInsideTransaction: { hashChanged: boolean; historyRows: number } | undefined;
    vi.mocked(createSession).mockImplementationOnce(() => {
      // Prove the fault really comes after the writes: at this point the transaction has
      // already replaced the hash, filed the old one and revoked the sessions.
      seenInsideTransaction = {
        hashChanged: userRow()?.passwordHash !== currentHash,
        historyRows: historyRows().length,
      };
      throw new Error('injected failure before commit');
    });

    const response = await change(used.token, valid());

    expect(seenInsideTransaction).toStrictEqual({ hashChanged: true, historyRows: 1 });
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(resolveSession(db, used.token)).not.toBeNull();
    expect(resolveSession(db, otherDevice.token)).not.toBeNull();
    // The failure was not sticky: the same request now succeeds.
    expect((await change(used.token, valid())).status).toBe(200);
  });

  it('lets exactly one of two simultaneous changes with the same session win, and files a single history entry', async () => {
    const { token } = open();
    const [a, b] = ['A first passphrase 11', 'A second passphrase 22'];

    const responses = await Promise.all([
      change(token, valid({ newPassword: a, confirmNewPassword: a })),
      change(token, valid({ newPassword: b, confirmNewPassword: b })),
    ]);

    // Both got past every check before either committed: the race is real, not a refusal early on.
    expect(hashPassword).toHaveBeenCalledTimes(2);
    expect(responses.map((r) => r.status).sort()).toStrictEqual([200, 409]);
    const [winner, loser] = responses[0]?.status === 200 ? [a, b] : [b, a];
    const refused = responses.find((r) => r.status === 409);
    expect((await refused?.json()).error.code).toBe('PASSWORD_CHANGE_ALREADY_COMPLETED');
    expect(refused?.headers.getSetCookie()).toHaveLength(0);
    const stored = userRow()?.passwordHash ?? '';
    expect(await verifyPassword(stored, winner as string)).toBe(true);
    expect(await verifyPassword(stored, loser as string)).toBe(false);
    expect(historyRows().map((r) => r.passwordHash)).toStrictEqual([currentHash]);
    expect(
      db
        .select()
        .from(sessions)
        .all()
        .filter((s) => s.revokedAt === null),
    ).toHaveLength(1);
    expect((await logIn(winner as string)).status).toBe(200);
    expect((await logIn(loser as string)).status).toBe(401);
  });
});

describe('POST /api/auth/change-password: logging', () => {
  const SECRET = 'log-canary-Pa55word-4471';

  it('never writes a password, hash or token to any log output, and only an event name and a request id', async () => {
    db.update(users)
      .set({ passwordHash: await hashPassword(`${SECRET}-current`) })
      .where(eq(users.id, userId))
      .run();
    const { token } = open();
    const output = captureOutput();

    const responses = [
      await change(token, valid({ currentPassword: `${SECRET}-wrong` })), // wrong current
      await change(token, valid({ currentPassword: `${SECRET}-current`, newPassword: 'short' })), // invalid
      await change(token, { ...valid(), extra: SECRET }), // malformed
      await change(token, {
        currentPassword: `${SECRET}-current`,
        newPassword: `${SECRET}-new`,
        confirmNewPassword: `${SECRET}-new`,
      }), // success
    ];
    const lines = output.lines();
    output.restore();

    const newToken = cookieValue(responses[3] as Response);
    const written = lines.join('\n');
    expect(newToken).not.toBe('');
    expect(written).not.toMatch(/canary|argon2/);
    expect(written).not.toContain(token);
    expect(written).not.toContain(newToken);
    const entries = lines.map((line) => JSON.parse(line) as Record<string, string>);
    expect(entries.map((entry) => entry.event)).toStrictEqual([
      'auth.change_password.denied',
      'auth.change_password.denied',
      'auth.change_password.denied',
      'auth.change_password.success',
    ]);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toStrictEqual(['event', 'requestId']);
    }
  });
});

describe('route configuration', () => {
  it('runs on the Node.js runtime (native Argon2 and SQLite) and is never cached or prerendered', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
