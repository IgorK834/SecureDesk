import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../../../../server/auth/password-hasher';
import { hashSessionToken } from '../../../../server/auth/session-service';
import { captureOutput } from '../../../../server/__fixtures__/capture-output';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { runMigrations } from '../../../../server/db/migrate';
import { sessions, users } from '../../../../server/db/schema';
import { seedDatabase } from '../../../../server/db/seeds';
import { loginRateLimiter } from '../../../../server/security/login-rate-limiter';
import { setClockForTests } from '../../../../server/time/clock';
import { POST, dynamic, runtime } from './route';

// These tests drive the real route handler against the real database wiring (an in-memory test
// database), the real Argon2id hashing and the real seeded accounts: what is asserted is what a
// client can observe over HTTP.

const PASSWORD = 'Correct horse battery staple';
const HOUR_MS = 60 * 60 * 1000;
const T0 = new Date('2026-03-10T12:00:00.000Z');
const GENERIC_401 =
  '{"error":{"code":"AUTH_INVALID_CREDENTIALS","message":"Login lub hasło niepoprawne"}}';
const COOKIE = '__Host-securedesk_session';

let passwordHash: string;
let now: Date;

const globalForDb = globalThis as typeof globalThis & { __securedeskDb?: unknown };

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

// Every test gets its own empty database: the shared `db` opens lazily, so pointing it at memory
// and dropping the cached connection is enough. (Rows cannot simply be deleted between tests:
// the database itself refuses to delete the ADMIN account.)
beforeEach(() => {
  vi.stubEnv('TEST_DATABASE_PATH', ':memory:');
  delete globalForDb.__securedeskDb;
  runMigrations(db);
  now = T0;
  setClockForTests({ now: () => now });
  // The route logs one line per request; tests that inspect the log capture it themselves.
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  db.$client.close();
  delete globalForDb.__securedeskDb;
  setClockForTests();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
      headers: { 'content-type': 'application/json', ...headers },
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

  it('sets exactly one cookie: HttpOnly, Secure, SameSite=Lax, Path=/, host-only', async () => {
    addUser();

    const response = await loginAs('employee1');

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    const attributes = (cookies[0] ?? '').split(';').map((part) => part.trim().toLowerCase());
    expect(attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(attributes.some((a) => a.startsWith('domain'))).toBe(false);
    expect(cookies[0]).toMatch(new RegExp(`^${COOKIE}=[A-Za-z0-9_-]{43};`));
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
    expect(cookie).toMatch(/^securedesk_session=/);
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

    now = new Date(T0.getTime() + 11 * HOUR_MS + 59 * 60 * 1000);
    const early = await loginAs('employee1', employee.password);
    expect(early.status).toBe(200);
    expect(await early.json()).toMatchObject({ authStage: 'INITIAL_PASSWORD_CHANGE' });

    now = new Date(T0.getTime() + 12 * HOUR_MS);
    const late = await loginAs('employee1', employee.password);
    expect(late.status).toBe(401);
    expect(await late.text()).toBe(GENERIC_401);
  });

  it('keeps the ADMIN bootstrap password usable long after 12 hours (no expiry by design)', async () => {
    const { created } = await seedDatabase(db);
    const admin = created.find((account) => account.login === 'ADMIN');
    if (!admin) throw new Error('ADMIN was not seeded');
    now = new Date(T0.getTime() + 400 * 24 * HOUR_MS);

    const response = await loginAs('admin', admin.password);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { role: 'ADMINISTRATOR' },
      authStage: 'INITIAL_PASSWORD_CHANGE',
    });
  });
});

describe('POST /api/auth/login: failures reveal nothing', () => {
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
    ['an empty login', { login: '', password: validPassword }],
    ['a login of only spaces', { login: '   ', password: validPassword }],
    ['a 65-character login', { login: 'l'.repeat(65), password: validPassword }],
    ['an empty password', { login: 'employee1', password: '' }],
    ['a 1025-character password', { login: 'employee1', password: 'p'.repeat(1025) }],
  ];

  it.each(bad)('rejects %s with 400 and the standard error shape', async (_, body) => {
    const check = vi.spyOn(loginRateLimiter, 'check');
    addUser();

    const response = await post(body as string);

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Nieprawidłowe dane żądania' },
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.getSetCookie()).toHaveLength(0);
    // Rejected before any account lookup or password work.
    expect(check).not.toHaveBeenCalled();
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
    const check = vi.spyOn(loginRateLimiter, 'check');
    addUser();

    const response = await post(
      { login: 'employee1', password: PASSWORD },
      { 'content-type': contentType },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: { code: 'VALIDATION_ERROR', message: 'Nieprawidłowe dane żądania' },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(check).not.toHaveBeenCalled();
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
});

describe('POST /api/auth/login: rate limiting hook', () => {
  it('answers a throttled attempt with 429 and Retry-After, even for correct credentials', async () => {
    vi.spyOn(loginRateLimiter, 'check').mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
    });
    addUser();

    const response = await loginAs('employee1');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(await response.json()).toStrictEqual({
      error: {
        code: 'AUTH_RATE_LIMITED',
        message: 'Zbyt wiele prób logowania. Spróbuj ponownie później',
      },
    });
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('keys the limiter on the first forwarded address, but only behind a trusted proxy', async () => {
    const check = vi.spyOn(loginRateLimiter, 'check');
    const forwarded = { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' };

    vi.stubEnv('TRUST_PROXY', 'true');
    await post({ login: 'Employee1', password: PASSWORD }, forwarded);
    // Without the header, or without a trusted proxy, the value is not taken from the client.
    await post({ login: 'Employee1', password: PASSWORD });
    vi.stubEnv('TRUST_PROXY', 'false');
    await post({ login: 'Employee1', password: PASSWORD }, forwarded);

    expect(check.mock.calls).toStrictEqual([
      ['203.0.113.7', 'employee1'],
      ['unknown', 'employee1'],
      ['unknown', 'employee1'],
    ]);
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
      'auth.login.invalid_request',
    ]);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toStrictEqual(['event', 'requestId']);
      expect(entry.requestId).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(new Set(entries.map((entry) => entry.requestId)).size).toBe(5);
  });

  it('answers an unexpected failure with a generic 500 and logs neither the error nor the input', async () => {
    vi.spyOn(loginRateLimiter, 'check').mockRejectedValue(
      new Error(`database exploded: params ${SECRET} $argon2id$v=19$leaked-hash`),
    );
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
