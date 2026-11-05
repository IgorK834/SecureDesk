import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { LOGIN_GUARD_STAGES } from '../../../../server/auth/login-guard';
import { hashPassword, verifyPassword } from '../../../../server/auth/password-hasher';
import { hashSessionToken } from '../../../../server/auth/session-service';
import { captureOutput } from '../../../../server/__fixtures__/capture-output';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import {
  honeytokens,
  loginAttempts,
  securityEvents,
  sessions,
  users,
} from '../../../../server/db/schema';
import { seedHoneytokens } from '../../../../server/db/seeds/honeytokens';
import { clearAlertDispatchers } from '../../../../server/security/alerts';
import { verifyCaptchaOrThrow } from '../../../../server/security/captcha';
import { flushPendingAlerts } from '../../../../server/security/events';
import { seedDatabase } from '../../../../server/db/seeds';
import { POST, dynamic, runtime } from './route';

vi.mock('../../../../server/security/captcha', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/security/captcha')>();
  return { ...actual, verifyCaptchaOrThrow: vi.fn(() => Promise.resolve()) };
});
vi.mock('../../../../server/auth/password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/auth/password-hasher')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

// These tests drive the real route handler against the real database wiring (an in-memory test
// database), the real Argon2id hashing and the real seeded accounts: what is asserted is what a
// client can observe over HTTP.

const PASSWORD = 'Correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;
const T0 = new Date('2026-03-10T12:00:00.000Z');
const GENERIC_401 =
  '{"error":{"code":"AUTH_INVALID_CREDENTIALS","message":"Login lub hasło niepoprawne"}}';
const COOKIE = '__Host-sd_session';

let passwordHash: string;
const fakeClock = new FakeClock(T0);

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

setUpSharedTestDb();

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  // The route logs one line per request; tests that inspect the log capture it themselves.
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(verifyCaptchaOrThrow).mockResolvedValue();
  vi.mocked(verifyPassword).mockClear();
  clearAlertDispatchers();
});

afterEach(async () => {
  await flushPendingAlerts();
  clearAlertDispatchers();
  fakeClock.uninstall();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function addUser(overrides: Partial<typeof users.$inferInsert> = {}) {
  return insertUser(db, {
    login: 'employee1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    passwordHash,
    ...overrides,
  });
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const loginAs = (login: string, password: string = PASSWORD) => post({ login, password });

/** The value of the session cookie a response sets. */
function cookieValue(response: Response): string {
  const header = response.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`));
  return header?.split(';')[0]?.slice(COOKIE.length + 1) ?? '';
}

describe('POST /api/auth/login: success', () => {
  it('returns 200, a session cookie and a body without any hash or token', async () => {
    const id = addUser();

    const response = await loginAs('employee1');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toStrictEqual({
      user: { id, login: 'employee1', firstName: 'Jan', lastName: 'Kowalski', role: 'EMPLOYEE' },
      authStage: 'FULLY_AUTHENTICATED',
      mustChangePassword: false,
    });
    expect(text).not.toMatch(/hash|token|argon2|\$/i);
    expect(text).not.toContain(cookieValue(response));
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('sets a protected session cookie and the Angular-readable XSRF cookie', async () => {
    addUser();

    const response = await loginAs('employee1');

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(`${COOKIE}=`)) ?? '';
    const xsrfCookie = cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN=')) ?? '';
    const attributes = sessionCookie.split(';').map((part) => part.trim().toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(attributes.some((a) => a.startsWith('domain'))).toBe(false);
    expect(sessionCookie).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(xsrfCookie).toMatch(/^XSRF-TOKEN=[A-Za-z0-9_-]{43};/);
    const xsrfAttributes = xsrfCookie.split(';').map((part) => part.trim().toLowerCase());
    expect(xsrfAttributes).toEqual(expect.arrayContaining(['secure', 'samesite=lax', 'path=/']));
    expect(xsrfAttributes).not.toContain('httponly');
  });

  it('backs the cookie with a stored session that holds only the token digest', async () => {
    const id = addUser();

    const token = cookieValue(await loginAs('employee1'));

    const rows = db.select().from(sessions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: id, tokenHash: hashSessionToken(token) });
  });

  it('can run over plain HTTP in development when COOKIE_SECURE=false', async () => {
    vi.stubEnv('COOKIE_SECURE', 'false');
    addUser();

    const response = await loginAs('employee1');

    const [cookie] = response.headers.getSetCookie();
    const attributes = (cookie ?? '').split(';').map((part) => part.trim().toLowerCase());
    expect(cookie).toMatch(/^sd_session=/);
    expect(attributes).not.toContain('secure');
    expect(attributes).toContain('httponly');
  });

  it('trims the login but takes the password exactly as sent', async () => {
    addUser({ passwordHash: await hashPassword(' spaced password ') });

    expect((await post({ login: '  employee1  ', password: ' spaced password ' })).status).toBe(
      200,
    );
    expect((await post({ login: 'employee1', password: 'spaced password' })).status).toBe(401);
  });

  it('accepts the longest allowed login and password', async () => {
    const longLogin = 'l'.repeat(64);
    const longPassword = 'p'.repeat(1024);
    addUser({ login: longLogin, passwordHash: await hashPassword(longPassword) });

    expect((await loginAs(longLogin, longPassword)).status).toBe(200);
  });

  it('accepts the strict Module 2 guard fields while their stages are pass-through', async () => {
    addUser();

    const internal = await post({
      login: 'employee1',
      password: PASSWORD,
      captcha: { challengeId: 'challenge-id', answer: 'reversed' },
      website: '',
      formToken: 'signed-form-token',
    });

    expect(internal.status).toBe(200);
  });

  it('replaces a session cookie the request already carried, so a planted one is useless', async () => {
    addUser();
    const planted = cookieValue(await loginAs('employee1'));

    const response = await post(
      { login: 'employee1', password: PASSWORD },
      { cookie: `${COOKIE}=${planted}` },
    );

    const fresh = cookieValue(response);
    expect(response.status).toBe(200);
    expect(fresh).not.toBe(planted);
    const byDigest = new Map(
      db
        .select()
        .from(sessions)
        .all()
        .map((row) => [row.tokenHash, row]),
    );
    expect(byDigest.get(hashSessionToken(planted))?.revokedAt).not.toBeNull();
    expect(byDigest.get(hashSessionToken(fresh))?.revokedAt).toBeNull();
  });
});

describe('POST /api/auth/login: accounts created by the seed', () => {
  it('lets every seeded account sign in with its generated password and forces a change', async () => {
    const { created } = await seedDatabase(db);
    expect(created).toHaveLength(7);

    for (const { login, password } of created) {
      const response = await loginAs(login, password);
      expect(response.status, login).toBe(200);
      expect(await response.json()).toMatchObject({
        authStage: 'INITIAL_PASSWORD_CHANGE',
        mustChangePassword: true,
      });
    }
  });

  it('honours the 12-hour temporary password: valid at 11 h 59 min, refused at 12 h', async () => {
    const { created } = await seedDatabase(db);
    const employee = created.find((account) => account.login === 'employee1');
    if (!employee) throw new Error('employee1 was not seeded');

    fakeClock.set(new Date(T0.getTime() + 11 * HOUR_MS + 59 * 60 * 1000));
    const early = await loginAs('employee1', employee.password);
    expect(early.status).toBe(200);
    expect(await early.json()).toMatchObject({ authStage: 'INITIAL_PASSWORD_CHANGE' });

    fakeClock.set(new Date(T0.getTime() + 12 * HOUR_MS));
    const late = await loginAs('employee1', employee.password);
    expect(late.status).toBe(401);
    expect(await late.text()).toBe(GENERIC_401);
  });

  it('keeps the ADMIN bootstrap password usable long after 12 hours (no expiry by design)', async () => {
    const { created } = await seedDatabase(db);
    const admin = created.find((account) => account.login === 'ADMIN');
    if (!admin) throw new Error('ADMIN was not seeded');
    fakeClock.set(new Date(T0.getTime() + 400 * 24 * HOUR_MS));

    const response = await loginAs('admin', admin.password);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { role: 'ADMINISTRATOR' },
      authStage: 'INITIAL_PASSWORD_CHANGE',
    });
  });
});

describe('POST /api/auth/login: failures reveal nothing (SEC-01, SEC-02)', () => {
  async function refusals() {
    addUser({ login: 'wrongpass' });
    addUser({ login: 'blocked', isBlocked: true });
    addUser({ login: 'deleted', deletedAt: T0 });
    addUser({
      login: 'expired',
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(T0.getTime() - 1),
    });
    return [
      await loginAs('nobody'),
      await loginAs('wrongpass', 'not the password'),
      await loginAs('blocked'),
      await loginAs('deleted'),
      await loginAs('expired'),
    ];
  }

  it('answers an unknown login, wrong password, blocked, deleted and expired account with byte-identical 401s', async () => {
    const responses = await refusals();

    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.text()).toBe(GENERIC_401);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    }
    const headerSets = responses.map((r) => JSON.stringify([...r.headers].sort()));
    expect(new Set(headerSets).size).toBe(1);
    expect(responses[0]?.headers.get('Cache-Control')).toBe('no-store');
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it.each([
    ["' OR '1'='1", "' OR '1'='1"],
    ["admin'--", 'anything'],
    ["employee1'; DROP TABLE users;--", PASSWORD],
    ['employee1" OR "1"="1', PASSWORD],
  ])(
    'never authenticates, and never errors, for the login %j (SEC-25)',
    async (login, password) => {
      addUser({ login: 'ADMIN' });

      const response = await post({ login, password });

      expect(response.status).toBe(401);
      expect(await response.text()).toBe(GENERIC_401);
      expect(db.select().from(users).all()).toHaveLength(1);
    },
  );
});

describe('POST /api/auth/login: honeypot and account trap', () => {
  const responseHeaders = (response: Response) => Object.fromEntries(response.headers.entries());

  it('SEC-49 returns the generic 401 after one dummy verification and records only an IP strike', async () => {
    addUser();
    const ordinary = await loginAs('employee1', 'wrong password');
    const ordinaryText = await ordinary.text();
    const accountAttemptsBefore = db
      .select()
      .from(loginAttempts)
      .all()
      .filter((attempt) => attempt.loginNormalized === 'employee1').length;
    vi.mocked(verifyPassword).mockClear();
    vi.mocked(verifyCaptchaOrThrow).mockClear();

    const trapped = await post({
      login: 'employee1',
      password: 'wrong password',
      website: 'x',
    });
    const trappedText = await trapped.text();

    expect(trapped.status).toBe(401);
    expect(trappedText).toBe(ordinaryText);
    expect(responseHeaders(trapped)).toStrictEqual(responseHeaders(ordinary));
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(vi.mocked(verifyPassword).mock.calls[0]?.[0]).not.toBe(passwordHash);
    expect(verifyCaptchaOrThrow).not.toHaveBeenCalled();
    const attempts = db.select().from(loginAttempts).all();
    expect(attempts.filter((attempt) => attempt.loginNormalized === 'employee1')).toHaveLength(
      accountAttemptsBefore,
    );
    expect(attempts.filter((attempt) => attempt.kind === 'HONEYPOT')).toMatchObject([
      { loginNormalized: null, ipKey: 'unknown', outcome: 'FAILED' },
    ]);
    expect(db.select().from(securityEvents).all()).toMatchObject([
      { type: 'HONEYPOT_TRIGGERED', severity: 'WARNING', ipKey: 'unknown' },
    ]);
  });

  it('SEC-50 lets an absent or empty website pass to CAPTCHA without a honeypot signal', async () => {
    addUser();

    expect((await post({ login: 'employee1', password: 'wrong' })).status).toBe(401);
    expect((await post({ login: 'employee1', password: 'wrong', website: '' })).status).toBe(401);

    expect(verifyCaptchaOrThrow).toHaveBeenCalledTimes(2);
    expect(
      db
        .select()
        .from(loginAttempts)
        .all()
        .map((attempt) => attempt.kind),
    ).toStrictEqual(['CREDENTIAL', 'CREDENTIAL']);
    expect(db.select().from(securityEvents).all()).toHaveLength(0);
  });

  it('SEC-34/SEC-51 makes backup_admin indistinguishable from an unknown login and alerts once', async () => {
    db.transaction((tx) => seedHoneytokens(tx));
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CANARY_ALERTS_ENABLED', 'true');
    vi.stubEnv('CANARY_ACCOUNT_TRAP_URL', 'http://alert-stub.test/web-bug');
    const fetchStub = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);

    vi.mocked(verifyPassword).mockClear();
    const trapped = await loginAs('backup_admin', 'anything');
    expect(verifyPassword).toHaveBeenCalledOnce();
    vi.mocked(verifyPassword).mockClear();
    const unknown = await loginAs('random_unknown', 'anything');
    expect(verifyPassword).toHaveBeenCalledOnce();
    const trappedText = await trapped.text();
    const unknownText = await unknown.text();
    await flushPendingAlerts();

    expect(trapped.status).toBe(401);
    expect(trappedText).toBe(GENERIC_401);
    expect(trappedText).toBe(unknownText);
    expect(responseHeaders(trapped)).toStrictEqual(responseHeaders(unknown));
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(db.select().from(securityEvents).all()).toMatchObject([
      {
        type: 'HONEYTOKEN_TRIGGERED',
        severity: 'CRITICAL',
        honeytokenId: 'account-trap-backup-admin',
        alertStatus: 'SENT',
      },
    ]);
    expect(
      db.select().from(honeytokens).where(eq(honeytokens.id, 'account-trap-backup-admin')).get(),
    ).toMatchObject({ triggerCount: 1, lastTriggeredAt: T0 });
    expect(db.select().from(users).where(eq(users.loginNormalized, 'backup_admin')).all()).toEqual(
      [],
    );
  });
});

describe('POST /api/auth/login: malformed requests', () => {
  const validPassword = 'x';
  const bad: [string, unknown][] = [
    ['an empty body', ''],
    ['text that is not JSON', 'login=a&password=b'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['an empty object', {}],
    ['a missing password', { login: 'employee1' }],
    ['a missing login', { password: validPassword }],
    ['a numeric login', { login: 123, password: validPassword }],
    ['a numeric password', { login: 'employee1', password: 123 }],
    ['an object as the password', { login: 'employee1', password: { $ne: '' } }],
    ['an extra key', { login: 'employee1', password: validPassword, role: 'ADMINISTRATOR' }],
    [
      'an extra CAPTCHA key',
      { login: 'employee1', password: validPassword, captcha: { token: 'x', answer: 'y' } },
    ],
    [
      'an empty CAPTCHA token',
      { login: 'employee1', password: validPassword, captcha: { token: '' } },
    ],
    ['a numeric honeypot', { login: 'employee1', password: validPassword, website: 1 }],
    ['an empty form token', { login: 'employee1', password: validPassword, formToken: '' }],
    ['an empty login', { login: '', password: validPassword }],
    ['a login of only spaces', { login: '   ', password: validPassword }],
    ['a 65-character login', { login: 'l'.repeat(65), password: validPassword }],
    ['an empty password', { login: 'employee1', password: '' }],
    ['a 1025-character password', { login: 'employee1', password: 'p'.repeat(1025) }],
  ];

  it.each(bad)('rejects %s with 400 and the standard error shape', async (_, body) => {
    addUser();

    const response = await post(body as string);

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Nieprawidłowe dane żądania' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    // Rejected before any account lookup or password work.
    expect(db.select().from(loginAttempts).all()).toHaveLength(0);
  });

  // A cross-site HTML form can only send these types without a CORS preflight. If they were read
  // as JSON, a malicious page could sign a victim into the attacker's account (login CSRF).
  it.each([
    ['text/plain', 'text/plain'],
    ['a form encoding', 'application/x-www-form-urlencoded'],
    ['multipart form data', 'multipart/form-data; boundary=x'],
    ['a JSON-like but different type', 'application/vnd.api+json'],
    ['text/json', 'text/json'],
    ['an empty Content-Type', ''],
  ])('refuses valid credentials sent as %s', async (_, contentType) => {
    addUser();

    const response = await post(
      { login: 'employee1', password: PASSWORD },
      { 'content-type': contentType },
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toStrictEqual({
      error: {
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: 'Wymagany Content-Type application/json',
      },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(db.select().from(loginAttempts).all()).toHaveLength(0);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });

  it.each([
    'application/json; charset=utf-8',
    'Application/JSON',
    'application/json ; charset=utf-8',
  ])('still accepts the JSON media type written as %j', async (contentType) => {
    addUser();

    const response = await post(
      { login: 'employee1', password: PASSWORD },
      { 'content-type': contentType },
    );

    expect(response.status).toBe(200);
  });

  it.each([
    ['a foreign Origin', { origin: 'https://evil.example' }],
    ['no Origin or Referer', { origin: '' }],
  ])('refuses login CSRF from %s before looking up the account', async (_, headers) => {
    addUser();

    const response = await post({ login: 'employee1', password: PASSWORD }, headers);

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('CSRF_ORIGIN_MISMATCH');
    expect(db.select().from(loginAttempts).all()).toHaveLength(0);
    expect(db.select().from(sessions).all()).toHaveLength(0);
  });
});

describe('POST /api/auth/login: ordered guard limits', () => {
  it('answers a throttled attempt with 429 and Retry-After, even for correct credentials', async () => {
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 20 }, (_, index) => ({
          loginNormalized: `login-${index}`,
          ipKey: 'unknown',
          kind: 'CREDENTIAL' as const,
          outcome: 'FAILED' as const,
          occurredAt: new Date(T0.getTime() - 858_000),
          resolvedAt: new Date(T0.getTime() - 858_000),
        })),
      )
      .run();
    addUser();

    const response = await loginAs('employee1');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toStrictEqual({
      error: {
        code: 'AUTH_IP_BLOCKED',
        message: 'Zbyt wiele nieudanych prób logowania z tego adresu. Spróbuj ponownie później',
        details: { retryAfterSeconds: 42 },
      },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('keys the limiter on the address the trusted proxy appended, but only behind a trusted proxy', async () => {
    const forwarded = { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' };

    vi.stubEnv('TRUST_PROXY', 'true');
    await post({ login: 'Employee1', password: PASSWORD }, forwarded);
    // Without the header, or without a trusted proxy, the value is not taken from the client.
    await post({ login: 'Employee1', password: PASSWORD });
    vi.stubEnv('TRUST_PROXY', 'false');
    await post({ login: 'Employee1', password: PASSWORD }, forwarded);

    expect(db.select({ ipKey: loginAttempts.ipKey }).from(loginAttempts).all()).toStrictEqual([
      { ipKey: '203.0.113.7' },
      { ipKey: 'unknown' },
      { ipKey: 'unknown' },
    ]);
  });

  it('SEC-55: the 21st failed attempt across distinct logins is IP-blocked and another address is unaffected', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 20 }, (_, index) => ({
          loginNormalized: `spray-${index}`,
          ipKey: '203.0.113.7',
          kind: 'CREDENTIAL' as const,
          outcome: 'FAILED' as const,
          occurredAt: T0,
          resolvedAt: T0,
        })),
      )
      .run();

    const blocked = await post(
      { login: 'spray-20', password: 'wrong' },
      { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' },
    );
    const otherAddress = await post(
      { login: 'spray-20', password: 'wrong' },
      { 'x-forwarded-for': '10.0.0.1, 203.0.113.8' },
    );

    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe('AUTH_IP_BLOCKED');
    expect(otherAddress.status).toBe(401);
  });

  it('SEC-56: rotating the forged leftmost X-Forwarded-For value does not evade a trusted proxy key', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 19 }, (_, index) => ({
          loginNormalized: `spray-${index}`,
          ipKey: '203.0.113.7',
          kind: 'CREDENTIAL' as const,
          outcome: 'FAILED' as const,
          occurredAt: T0,
          resolvedAt: T0,
        })),
      )
      .run();

    expect(
      (
        await post(
          { login: 'spray-19', password: 'wrong' },
          { 'x-forwarded-for': '198.51.100.1, 203.0.113.7' },
        )
      ).status,
    ).toBe(401);
    const rotated = await post(
      { login: 'spray-20', password: 'wrong' },
      { 'x-forwarded-for': '198.51.100.99, 203.0.113.7' },
    );

    expect(rotated.status).toBe(429);
    expect((await rotated.json()).error.code).toBe('AUTH_IP_BLOCKED');
  });

  it('SEC-57: the eighth distinct failed login raises one spraying event in the bucket', async () => {
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 7 }, (_, index) => ({
          loginNormalized: `spray-${index}`,
          ipKey: 'unknown',
          kind: 'CREDENTIAL' as const,
          outcome: 'FAILED' as const,
          occurredAt: T0,
          resolvedAt: T0,
        })),
      )
      .run();

    expect((await loginAs('spray-7', 'wrong')).status).toBe(401);
    expect((await loginAs('spray-8', 'wrong')).status).toBe(401);

    const spraying = db
      .select()
      .from(securityEvents)
      .all()
      .filter((event) => event.type === 'PASSWORD_SPRAYING_SUSPECTED');
    expect(spraying).toHaveLength(1);
    expect(JSON.parse(spraying[0]?.details ?? '{}')).toStrictEqual({
      distinctLogins: 8,
      threshold: 8,
    });
  });

  it('SEC-34: the fifth failure is the same account-lock response for an existing and unknown login', async () => {
    addUser();

    const fifthResponse = async (login: string) => {
      const responses: Response[] = [];
      for (let attempt = 0; attempt < 5; attempt++) {
        responses.push(await loginAs(login, 'definitely-not-the-password'));
      }
      expect(responses.slice(0, 4).map((response) => response.status)).toStrictEqual([
        401, 401, 401, 401,
      ]);
      return responses[4] as Response;
    };

    const existing = await fifthResponse('employee1');
    const unknown = await fifthResponse('does-not-exist');

    expect(existing.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(existing.headers.get('Retry-After')).toBe('900');
    expect(unknown.headers.get('Retry-After')).toBe('900');
    const existingBody = await existing.text();
    const unknownBody = await unknown.text();
    expect(existingBody).toBe(unknownBody);
    expect(JSON.parse(existingBody)).toStrictEqual({
      error: {
        code: 'AUTH_ACCOUNT_LOCKED',
        message: 'Konto jest tymczasowo zablokowane po zbyt wielu nieudanych próbach logowania',
        details: {
          lockedUntil: '2026-03-10T12:15:00.000Z',
          retryAfterSeconds: 900,
        },
      },
    });
  });
});

describe('POST /api/auth/login: logging', () => {
  const SECRET = 'log-canary-Pa55word-4471';

  async function attemptsAndLogs() {
    addUser({ passwordHash: await hashPassword(SECRET) });
    addUser({ login: 'blocked', isBlocked: true, passwordHash: await hashPassword(SECRET) });
    const output = captureOutput();
    const responses = [
      await loginAs('employee1', SECRET), // success
      await loginAs('employee1', `${SECRET}-wrong`), // wrong password
      await loginAs('blocked', SECRET), // blocked
      await loginAs('nobody', SECRET), // unknown
      await post({ login: 'employee1', password: SECRET, extra: true }), // malformed
    ];
    const lines = output.lines();
    output.restore();
    return { responses, lines };
  }

  it('never writes the submitted password, the stored hash or the session token to any log output', async () => {
    const { responses, lines } = await attemptsAndLogs();
    const token = cookieValue(responses[0] as Response);

    const written = lines.join('\n');
    expect(token).not.toBe('');
    expect(written).not.toContain('canary');
    expect(written).not.toContain('argon2');
    expect(written).not.toContain(token);
  });

  it('logs only an event name and a request id, and one line per request', async () => {
    const { lines } = await attemptsAndLogs();

    expect(lines).toHaveLength(5);
    const entries = lines.map((line) => JSON.parse(line) as Record<string, string>);
    expect(entries.map((entry) => entry.event)).toStrictEqual([
      'auth.login.success',
      'auth.login.failure',
      'auth.login.failure',
      'auth.login.failure',
      'auth.login.denied', // the malformed body, logged by the route wrapper like every refusal
    ]);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toStrictEqual(['event', 'requestId']);
      expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(new Set(entries.map((entry) => entry.requestId)).size).toBe(5);
  });

  it('answers an unexpected failure with a generic 500 and logs neither the error nor the input', async () => {
    const ipStage = LOGIN_GUARD_STAGES.find((stage) => stage.name === 'ipBlock');
    if (!ipStage) throw new Error('ipBlock stage missing');
    vi.spyOn(ipStage, 'run').mockImplementation(() => {
      throw new Error(`database exploded: params ${SECRET} $argon2id$v=19$leaked-hash`);
    });
    addUser();
    const output = captureOutput();

    const response = await loginAs('employee1', SECRET);
    const lines = output.lines();
    output.restore();

    expect(response.status).toBe(500);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toStrictEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Wystąpił błąd serwera' },
    });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'auth.login.error' });
    expect(lines.join('\n')).not.toMatch(/canary|exploded|argon2|leaked/);
  });
});

describe('route configuration', () => {
  it('runs on the Node.js runtime (native Argon2 and SQLite) and is never cached or prerendered', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
