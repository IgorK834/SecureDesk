import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../../../../server/auth/cookie';
import { hashPassword, verifyPassword } from '../../../../server/auth/password-hasher';
import {
  createSession,
  hashSessionToken,
  resolveSession,
} from '../../../../server/auth/session-service';
import {
  type TemporaryCredential,
  issueTemporaryCredential,
} from '../../../../server/auth/temporary-password';
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
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { csrfTokenForSession } from '../../../../server/security/csrf';
import { POST as changePassword } from '../change-password/route';
import { POST as login } from '../login/route';
import { POST as logout } from '../logout/route';
import { GET as me } from '../me/route';
import { POST, dynamic, runtime } from './route';

// These tests drive the real route handlers, the real guards, the real Argon2id hashing and the
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
const HOUR_MS = 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const COOKIE = '__Host-sd_session';
const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const CHANGE_REQUIRED =
  '{"error":{"code":"AUTH_PASSWORD_CHANGE_REQUIRED","message":"Wymagana zmiana hasła"}}';
const NEW_PASSWORD = 'A brand new passphrase 1';

let temporary: TemporaryCredential;
let userId: string;
const fakeClock = new FakeClock(T0);

setUpSharedTestDb();

beforeEach(async () => {
  fakeClock.set(T0);
  fakeClock.install();
  // A freshly issued temporary password, exactly as the administrator would hand it over.
  temporary = await issueTemporaryCredential();
  userId = insertUser(db, {
    login: 'employee1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    passwordHash: temporary.hash,
    mustChangePassword: true,
    temporaryPasswordExpiresAt: temporary.expiresAt,
  });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(hashPassword).mockClear();
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const open = (stage: AuthStage = 'INITIAL_PASSWORD_CHANGE') => createSession(db, userId, stage);
const cookieHeader = (token: string) => `${sessionCookieName()}=${token}`;
const csrfFor = (token: string) => {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .get();
  return session ? csrfTokenForSession(session.id) : undefined;
};

function post(
  handler: (request: NextRequest) => Promise<Response> | Response,
  path: string,
  token: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return handler(
    new NextRequest(`http://localhost:3000${path}`, {
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

const changeInitial = (
  token: string | undefined,
  body: unknown,
  headers: Record<string, string> = {},
) => post(POST, '/api/auth/change-initial-password', token, body, headers);

const valid = (overrides: Record<string, unknown> = {}) => ({
  newPassword: NEW_PASSWORD,
  confirmNewPassword: NEW_PASSWORD,
  ...overrides,
});

const get = (
  handler: (request: NextRequest) => Promise<Response> | Response,
  path: string,
  token: string,
) =>
  handler(
    new NextRequest(`http://localhost:3000${path}`, { headers: { cookie: cookieHeader(token) } }),
  );
const whoAmI = (token: string) => get(me, '/api/auth/me', token);

const logIn = (password: string) =>
  post(login, '/api/auth/login', undefined, { login: 'employee1', password });

/** The value of the session cookie a response sets. */
function cookieValue(response: Response): string {
  const header = response.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
  return header?.split(';')[0]?.slice(COOKIE.length + 1) ?? '';
}

// These two stand in for a business route and an admin route with exactly what every such route
// uses: the route wrapper admitting only a fully authenticated session (plus a permission).
const adminUsers = defineRoute({
  name: 'test.admin_users',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  handler: () => NextResponse.json({ users: [] }),
});
const tickets = defineRoute({
  name: 'test.tickets',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  handler: () => NextResponse.json({ tickets: [] }),
});

/** Everything that holds a credential, whole rows: "unchanged" means byte-identical. */
const credentials = () => ({
  users: db.select().from(users).all(),
  history: db.select().from(passwordHistory).all(),
});
const userRow = () => db.select().from(users).where(eq(users.id, userId)).get();
const liveSessions = () =>
  db
    .select()
    .from(sessions)
    .all()
    .filter((row) => row.revokedAt === null);

describe('first login with a temporary password (SEC-04)', () => {
  it('opens a restricted INITIAL_PASSWORD_CHANGE session and tells the client a change is owed', async () => {
    const response = await logIn(temporary.plaintext);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authStage: 'INITIAL_PASSWORD_CHANGE',
      mustChangePassword: true,
    });
    expect(liveSessions().map((row) => row.authStage)).toStrictEqual(['INITIAL_PASSWORD_CHANGE']);
  });
});

describe('the restricted stage is enforced by the backend (SEC-05)', () => {
  it('lets the client find out what is owed: /api/auth/me answers', async () => {
    const response = await whoAmI(cookieValue(await logIn(temporary.plaintext)));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      authStage: 'INITIAL_PASSWORD_CHANGE',
      mustChangePassword: true,
    });
  });

  it('answers 403 AUTH_PASSWORD_CHANGE_REQUIRED to the admin and ticket endpoints, however they are reached', async () => {
    const token = cookieValue(await logIn(temporary.plaintext));

    for (const [name, handler, path] of [
      ['GET /api/admin/users', adminUsers, '/api/admin/users'],
      ['GET /api/tickets', tickets, '/api/tickets'],
    ] as const) {
      const response = await get(handler, path, token);
      expect(response.status, name).toBe(403);
      expect(await response.text(), name).toBe(CHANGE_REQUIRED);
    }
  });

  it('answers 403 AUTH_PASSWORD_CHANGE_REQUIRED to the ordinary password change, which needs a full session', async () => {
    const { token } = open();
    const before = credentials();

    const response = await post(changePassword, '/api/auth/change-password', token, {
      currentPassword: temporary.plaintext,
      newPassword: NEW_PASSWORD,
      confirmNewPassword: NEW_PASSWORD,
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(CHANGE_REQUIRED);
    expect(credentials()).toStrictEqual(before);
  });

  it('still lets the user sign out', async () => {
    const { token } = open();

    expect((await post(logout, '/api/auth/logout', token, undefined)).status).toBe(204);
    expect(resolveSession(db, token)).toBeNull();
  });

  it('grants normal access once the change is made', async () => {
    const token = cookieValue(await changeInitial(open().token, valid()));

    const response = await get(tickets, '/api/tickets', token);

    expect(response.status).toBe(200);
  });
});

describe('POST /api/auth/change-initial-password: who may call it', () => {
  it.each([
    ['no cookie', undefined],
    ['a malformed token', 'not-a-token'],
    ['a token that was never issued', 'A'.repeat(43)],
  ])('answers 401 AUTH_REQUIRED for %s and changes nothing', async (_, token) => {
    const before = credentials();

    const response = await changeInitial(token, valid());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
  });

  it('answers 403 AUTH_FORBIDDEN to a fully authenticated session: there is nothing initial left to change', async () => {
    const { token } = open('FULLY_AUTHENTICATED');
    const before = credentials();

    const response = await changeInitial(token, valid());

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('AUTH_FORBIDDEN');
    expect(credentials()).toStrictEqual(before);
  });

  it('answers 403 AUTH_PASSWORD_CHANGE_REQUIRED to an expired-password session, which has its own endpoint', async () => {
    const { token } = open('PASSWORD_EXPIRED');
    const before = credentials();

    const response = await changeInitial(token, valid());

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(CHANGE_REQUIRED);
    expect(credentials()).toStrictEqual(before);
  });

  it('checks the session before it looks at the body, so an anonymous caller learns nothing about validation', async () => {
    expect((await changeInitial(undefined, '{not json')).status).toBe(401);
  });
});

describe('POST /api/auth/change-initial-password: validation', () => {
  it('rejects two different entries with a field error and leaves the account untouched', async () => {
    const { token } = open();
    const before = credentials();

    const response = await changeInitial(
      token,
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
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(userRow()).toMatchObject({ passwordHash: temporary.hash, mustChangePassword: true });
    expect(resolveSession(db, token)?.session.authStage).toBe('INITIAL_PASSWORD_CHANGE');
  });

  it.each([
    ['an 11-character password', 'qpwoeirutya', ['TOO_SHORT']],
    ['an empty password', '', ['TOO_SHORT']],
    ['129 characters', 'a'.repeat(129), ['TOO_LONG']],
    ['a very common password', 'password1234', ['COMMON_PASSWORD']],
  ])(
    'answers 400 PASSWORD_POLICY_VIOLATION with the violation code for %s',
    async (_, password, expected) => {
      const { token } = open();
      const before = credentials();

      const response = await changeInitial(
        token,
        valid({ newPassword: password, confirmNewPassword: password }),
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual({
        error: {
          code: 'PASSWORD_POLICY_VIOLATION',
          message: 'Hasło nie spełnia wymagań bezpieczeństwa',
          details: { violations: expected },
        },
      });
      expect(credentials()).toStrictEqual(before);
      expect(resolveSession(db, token)?.session.authStage).toBe('INITIAL_PASSWORD_CHANGE');
    },
  );

  it('applies the personal-data rule when the administrator turned it on, without echoing the profile', async () => {
    db.insert(securitySettings).values({ id: 1, rejectPersonalDataInPassword: true }).run();
    const before = credentials();

    const response = await changeInitial(
      open().token,
      valid({ newPassword: 'MyJANpassphrase 2026', confirmNewPassword: 'MyJANpassphrase 2026' }),
    );

    expect(response.status).toBe(400);
    const text = await response.text();
    expect(JSON.parse(text).error.details).toStrictEqual({ violations: ['CONTAINS_FIRST_NAME'] });
    expect(text).not.toMatch(/jan|kowalski|employee1/i);
    expect(credentials()).toStrictEqual(before);
  });

  it('refuses to keep the temporary password as the new one', async () => {
    const before = credentials();

    const response = await changeInitial(
      open().token,
      valid({ newPassword: temporary.plaintext, confirmNewPassword: temporary.plaintext }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('PASSWORD_REUSED');
    expect(credentials()).toStrictEqual(before);
  });

  const bad: [string, unknown][] = [
    ['an empty body', ''],
    ['text that is not JSON', 'newPassword=a'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['an empty object', {}],
    ['a missing confirmation', { newPassword: NEW_PASSWORD }],
    ['a numeric new password', valid({ newPassword: 123 })],
    ['an object as the new password', valid({ newPassword: { $ne: '' } })],
    ['an extra key', valid({ role: 'ADMINISTRATOR' })],
    ['the current password, which this endpoint does not take', valid({ currentPassword: 'x' })],
    ['a 1025-character new password', valid({ newPassword: 'p'.repeat(1025) })],
  ];

  it.each(bad)('rejects %s with 400 VALIDATION_ERROR and changes nothing', async (_, body) => {
    const { token } = open();
    const before = credentials();

    const response = await changeInitial(token, body);

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Nieprawidłowe dane żądania' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
  });

  it.each([
    ['text/plain', 'text/plain'],
    ['a form encoding', 'application/x-www-form-urlencoded'],
    ['an empty Content-Type', ''],
  ])(
    'refuses valid input sent as %s, which a cross-site form could send',
    async (_, contentType) => {
      const before = credentials();

      const response = await changeInitial(open().token, valid(), { 'content-type': contentType });

      expect(response.status).toBe(415);
      expect(credentials()).toStrictEqual(before);
    },
  );
});

describe('POST /api/auth/change-initial-password: success', () => {
  it('answers 200 with the profile and the new stage, and a fresh cookie, without hash or token in the body', async () => {
    const { token } = open();

    const response = await changeInitial(token, valid());
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
    expect(cookieValue(response)).not.toBe(token);
  });

  it('flips the account to normal access in one step: new hash, no more forced change, no deadline', async () => {
    fakeClock.advance(HOUR_MS);

    await changeInitial(open().token, valid());

    const row = userRow();
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row?.passwordHash).not.toBe(temporary.hash);
    expect(await verifyPassword(row?.passwordHash ?? '', NEW_PASSWORD)).toBe(true);
    expect(row?.mustChangePassword).toBe(false);
    expect(row?.temporaryPasswordExpiresAt).toBeNull();
    expect(row?.passwordChangedAt).toStrictEqual(new Date(T0.getTime() + HOUR_MS));
  });

  it('never records the temporary password in the history', async () => {
    await changeInitial(open().token, valid());

    expect(db.select().from(passwordHistory).all()).toStrictEqual([]);
  });

  it('rotates the session: the old cookie is dead, the new one is fully authenticated', async () => {
    const used = open();
    const otherDevice = open();

    const response = await changeInitial(used.token, valid());

    for (const old of [used, otherDevice]) {
      const refused = await whoAmI(old.token);
      expect(refused.status).toBe(401);
      expect(await refused.text()).toBe(NOT_SIGNED_IN);
    }
    const fresh = await whoAmI(cookieValue(response));
    expect(fresh.status).toBe(200);
    expect(await fresh.json()).toMatchObject({
      authStage: 'FULLY_AUTHENTICATED',
      mustChangePassword: false,
    });
    expect(liveSessions()).toHaveLength(1);
  });

  it('retires the temporary password for good: it no longer authenticates, the new one does', async () => {
    await changeInitial(open().token, valid());

    const old = await logIn(temporary.plaintext);
    expect(old.status).toBe(401);
    expect(old.headers.getSetCookie()).toHaveLength(0);
    const next = await logIn(NEW_PASSWORD);
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({
      authStage: 'FULLY_AUTHENTICATED',
      mustChangePassword: false,
    });
  });

  it('has the new password count towards the history of the next ordinary change', async () => {
    const token = cookieValue(await changeInitial(open().token, valid()));
    fakeClock.advance(MINUTE_MS);
    const second = 'A second passphrase 22';

    const response = await post(changePassword, '/api/auth/change-password', token, {
      currentPassword: NEW_PASSWORD,
      newPassword: second,
      confirmNewPassword: second,
    });
    expect(response.status).toBe(200);

    const back = await post(changePassword, '/api/auth/change-password', cookieValue(response), {
      currentPassword: second,
      newPassword: NEW_PASSWORD,
      confirmNewPassword: NEW_PASSWORD,
    });
    expect(back.status).toBe(400);
    expect((await back.json()).error.code).toBe('PASSWORD_REUSED');
  });
});

describe('POST /api/auth/change-initial-password: the 12-hour deadline', () => {
  // The session can outlive the password it was opened with, so the deadline is checked again.
  async function sessionOpenedBeforeTheDeadline() {
    fakeClock.set(new Date(T0.getTime() + 11 * HOUR_MS + 50 * MINUTE_MS));
    const response = await logIn(temporary.plaintext);
    expect(await response.clone().json()).toMatchObject({ authStage: 'INITIAL_PASSWORD_CHANGE' });
    return cookieValue(response);
  }

  it('answers 401 AUTH_TEMPORARY_PASSWORD_EXPIRED from exactly 12 hours and revokes the session', async () => {
    const token = await sessionOpenedBeforeTheDeadline();
    fakeClock.set(temporary.expiresAt);
    const before = credentials();

    const response = await changeInitial(token, valid());

    expect(response.status).toBe(401);
    expect(await response.json()).toStrictEqual({
      error: { code: 'AUTH_TEMPORARY_PASSWORD_EXPIRED', message: 'Hasło tymczasowe wygasło' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(resolveSession(db, token)).toBeNull();
    expect((await whoAmI(token)).status).toBe(401);
    expect(liveSessions()).toHaveLength(0);
  });

  it('still accepts the change one millisecond before the deadline', async () => {
    const token = await sessionOpenedBeforeTheDeadline();
    fakeClock.set(new Date(temporary.expiresAt.getTime() - 1));

    const response = await changeInitial(token, valid());

    expect(response.status).toBe(200);
  });
});

describe('POST /api/auth/change-initial-password: all or nothing', () => {
  it('rolls back the new hash, the flags and the revocations when the last step of the transaction fails', async () => {
    const used = open();
    const otherDevice = open();
    const before = credentials();
    let seenInsideTransaction: { hashChanged: boolean; mustChange: boolean } | undefined;
    vi.mocked(createSession).mockImplementationOnce(() => {
      // Prove the fault really comes after the update: here the transaction has already
      // replaced the hash and cleared the flag.
      seenInsideTransaction = {
        hashChanged: userRow()?.passwordHash !== temporary.hash,
        mustChange: userRow()?.mustChangePassword ?? true,
      };
      throw new Error('injected failure before commit');
    });

    const response = await changeInitial(used.token, valid());

    expect(seenInsideTransaction).toStrictEqual({ hashChanged: true, mustChange: false });
    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe('INTERNAL_ERROR');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(credentials()).toStrictEqual(before);
    expect(userRow()).toMatchObject({
      passwordHash: temporary.hash,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: temporary.expiresAt,
    });
    expect(resolveSession(db, used.token)?.session.authStage).toBe('INITIAL_PASSWORD_CHANGE');
    expect(resolveSession(db, otherDevice.token)).not.toBeNull();
    // The failure was not sticky: the same request now succeeds.
    expect((await changeInitial(used.token, valid())).status).toBe(200);
  });

  it('lets exactly one of two simultaneous requests with the same session win and answers the other 409', async () => {
    const { token } = open();
    const [a, b] = ['A first passphrase 11', 'A second passphrase 22'];

    const responses = await Promise.all([
      changeInitial(token, valid({ newPassword: a, confirmNewPassword: a })),
      changeInitial(token, valid({ newPassword: b, confirmNewPassword: b })),
    ]);

    // Both got past every check before either committed: the race is real, not a refusal early on.
    expect(hashPassword).toHaveBeenCalledTimes(2);
    expect(responses.map((r) => r.status).sort()).toStrictEqual([200, 409]);
    const refused = responses.find((r) => r.status === 409);
    expect(await refused?.json()).toStrictEqual({
      error: {
        code: 'PASSWORD_CHANGE_ALREADY_COMPLETED',
        message: 'Zmiana hasła została już wykonana',
      },
    });
    expect(refused?.headers.getSetCookie()).toHaveLength(0);
    // One consistent end state: the winner's password, normal access, one live session.
    const [winner, loser] = responses[0]?.status === 200 ? [a, b] : [b, a];
    const row = userRow();
    expect(await verifyPassword(row?.passwordHash ?? '', winner as string)).toBe(true);
    expect(await verifyPassword(row?.passwordHash ?? '', loser as string)).toBe(false);
    expect(row).toMatchObject({ mustChangePassword: false, temporaryPasswordExpiresAt: null });
    expect(liveSessions().map((s) => s.authStage)).toStrictEqual(['FULLY_AUTHENTICATED']);
    expect(db.select().from(passwordHistory).all()).toStrictEqual([]);
    expect((await logIn(winner as string)).status).toBe(200);
    expect((await logIn(loser as string)).status).toBe(401);
  });

  it('does not change the password again when the same request is repeated with the old cookie', async () => {
    const { token } = open();
    await changeInitial(token, valid());
    const after = credentials();

    const repeat = await changeInitial(
      token,
      valid({ newPassword: 'Yet another phrase 33', confirmNewPassword: 'Yet another phrase 33' }),
    );

    // The session was rotated away, so the repeat is simply not signed in; nothing is rewritten.
    expect(repeat.status).toBe(401);
    expect(credentials()).toStrictEqual(after);
  });
});

describe('POST /api/auth/change-initial-password: logging', () => {
  const SECRET = 'log-canary-Pa55word-4471';

  it('never writes a password, hash or token to any log output, and only an event name and a request id', async () => {
    const { token } = open();
    const output = captureOutput();

    const responses = [
      await changeInitial(token, valid({ newPassword: 'short', confirmNewPassword: 'short' })), // policy
      await changeInitial(token, valid({ confirmNewPassword: `${SECRET}-other` })), // mismatch
      await changeInitial(token, { ...valid(), extra: SECRET }), // malformed
      await changeInitial(token, {
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
    expect(written).not.toContain(temporary.plaintext);
    expect(written).not.toContain(token);
    expect(written).not.toContain(newToken);
    const entries = lines.map((line) => JSON.parse(line) as Record<string, string>);
    expect(entries.map((entry) => entry.event)).toStrictEqual([
      'auth.change_initial_password.denied',
      'auth.change_initial_password.denied',
      'auth.change_initial_password.denied',
      'auth.change_initial_password.success',
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
