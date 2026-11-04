import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyPassword } from '../../../server/auth/password-hasher';
import { createSession, hashSessionToken } from '../../../server/auth/session-service';
import { setUpSharedTestDb } from '../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../server/db/__fixtures__/test-db';
import { db } from '../../../server/db/client';
import {
  loginAttempts,
  passwordHistory,
  securityEvents,
  sessions,
  users,
} from '../../../server/db/schema';
import { csrfTokenForSession } from '../../../server/security/csrf';
import {
  CAPTCHA_FALLBACK_FAILURE_THRESHOLD,
  observeTurnstileResult,
  resetCaptchaCircuitBreakerForTests,
} from '../../../server/security/captcha/circuit-breaker';
import { issueInternalChallenge } from '../../../server/security/captcha/internal';
import { POST as changeInitialPassword } from './change-initial-password/route';
import { POST as changePassword } from './change-password/route';

vi.mock('../../../server/auth/password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/auth/password-hasher')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const CURRENT = 'Current regular password 1';
const NEXT = 'A brand new regular password 2';
const THIRD = 'A third regular password value 3';
const env = {
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'secret-key',
  CAPTCHA_EXPECTED_HOSTNAME: 'localhost',
};

let currentHash: string;
let userId: string;

setUpSharedTestDb();

beforeAll(async () => {
  currentHash = await hashPassword(CURRENT);
});

beforeEach(() => {
  resetCaptchaCircuitBreakerForTests();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  userId = insertUser(db, {
    login: 'captcha-user',
    passwordHash: currentHash,
    passwordChangedAt: new Date('2030-01-01T00:00:00.000Z'),
  });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(verifyPassword).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetCaptchaCircuitBreakerForTests();
});

function csrfFor(token: string): string {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .get();
  if (!session) throw new Error('test session is missing');
  return csrfTokenForSession(session.id);
}

function post(
  handler: typeof changePassword,
  path: string,
  token: string,
  body: Record<string, unknown>,
) {
  return handler(
    new NextRequest(`http://localhost:3000${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        cookie: `__Host-sd_session=${token}`,
        'x-xsrf-token': csrfFor(token),
      },
      body: JSON.stringify(body),
    }),
  );
}

const valid = (captcha?: { token: string }) => ({
  currentPassword: CURRENT,
  newPassword: NEXT,
  confirmNewPassword: NEXT,
  ...(captcha && { captcha }),
});

const credentials = () => ({
  users: db.select().from(users).all(),
  history: db.select().from(passwordHistory).all(),
});

describe('password routes preserve credentials after CAPTCHA refusal (SEC-44)', () => {
  it('maps a missing proof to 400 without checking the current password', async () => {
    const before = credentials();
    const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

    const response = await post(changePassword, '/api/auth/change-password', token, valid());

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('CAPTCHA_REQUIRED');
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(credentials()).toStrictEqual(before);
    expect(db.select().from(loginAttempts).all()).toHaveLength(1);
    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .map((event) => event.type),
    ).toStrictEqual(['CAPTCHA_FAILED']);
  });

  it.each([
    [
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] })),
      403,
      'CAPTCHA_FAILED',
    ],
    [new Response('provider down', { status: 500 }), 503, 'CAPTCHA_UNAVAILABLE'],
  ])(
    'fails closed on a forged token or provider outage before credentials (SEC-43)',
    async (providerResponse, status, code) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => providerResponse),
      );
      const before = credentials();
      const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

      const response = await post(
        changePassword,
        '/api/auth/change-password',
        token,
        valid({ token: 'forged' }),
      );

      expect(response.status).toBe(status);
      expect((await response.json()).error.code).toBe(code);
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(credentials()).toStrictEqual(before);
    },
  );

  it('also protects the forced initial-password route', async () => {
    db.update(users)
      .set({ mustChangePassword: true, temporaryPasswordExpiresAt: null })
      .where(eq(users.id, userId))
      .run();
    const { token } = createSession(db, userId, 'INITIAL_PASSWORD_CHANGE');

    const response = await post(changeInitialPassword, '/api/auth/change-initial-password', token, {
      newPassword: NEXT,
      confirmNewPassword: NEXT,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('CAPTCHA_REQUIRED');
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('accepts a valid token once and refuses its replay before checking credentials (SEC-45)', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            action: 'change-password',
            hostname: 'localhost',
            challenge_ts: new Date().toISOString(),
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })),
      );
    vi.stubGlobal('fetch', fetchStub);
    const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

    const first = await post(
      changePassword,
      '/api/auth/change-password',
      token,
      valid({ token: 'one-use-token' }),
    );
    expect(first.status).toBe(200);
    const nextToken = first.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-sd_session='))
      ?.split(';')[0]
      ?.split('=')[1];
    expect(nextToken).toBeTruthy();
    const afterFirst = credentials();
    vi.mocked(verifyPassword).mockClear();

    const replay = await post(changePassword, '/api/auth/change-password', nextToken as string, {
      currentPassword: NEXT,
      newPassword: THIRD,
      confirmNewPassword: THIRD,
      captcha: { token: 'one-use-token' },
    });

    expect(replay.status).toBe(403);
    expect((await replay.json()).error.code).toBe('CAPTCHA_FAILED');
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(credentials()).toStrictEqual(afterFirst);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it('changes a password through the same route when reCAPTCHA is selected', async () => {
    vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'recaptcha');
    vi.stubEnv('RECAPTCHA_SITE_KEY', 'recaptcha-site-key');
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret-key');
    vi.stubEnv('RECAPTCHA_VERIFY_URL', 'http://stub.test/recaptcha');
    const fetchStub = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            score: 0.9,
            action: 'change_password',
            hostname: 'localhost',
            challenge_ts: new Date(Date.now() - 1_000).toISOString(),
          }),
        ),
    );
    vi.stubGlobal('fetch', fetchStub);
    const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

    const response = await post(
      changePassword,
      '/api/auth/change-password',
      token,
      valid({ token: 'recaptcha-proof' }),
    );

    expect(response.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url] = fetchStub.mock.calls[0] as unknown as [string];
    expect(url).toBe('http://stub.test/recaptcha');
  });

  it('returns 503 before credentials when the selected reCAPTCHA provider times out', async () => {
    vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'recaptcha');
    vi.stubEnv('RECAPTCHA_SITE_KEY', 'recaptcha-site-key');
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'recaptcha-secret-key');
    vi.stubEnv('RECAPTCHA_VERIFY_URL', 'http://stub.test/recaptcha');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }),
    );
    const before = credentials();
    const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

    const response = await post(
      changePassword,
      '/api/auth/change-password',
      token,
      valid({ token: 'recaptcha-proof' }),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('CAPTCHA_UNAVAILABLE');
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(credentials()).toStrictEqual(before);
  });

  it('accepts the internal proof shape when the Turnstile fallback circuit is open', async () => {
    vi.stubEnv('CAPTCHA_FALLBACK', 'internal');
    vi.stubEnv('CAPTCHA_HMAC_SECRET', 'fallback-hmac-secret');
    const now = new Date();
    const unavailable = { ok: false as const, reason: 'UNAVAILABLE' as const };
    for (let count = 0; count < CAPTCHA_FALLBACK_FAILURE_THRESHOLD; count++) {
      observeTurnstileResult('change-password', process.env, now, unavailable);
    }
    const issued = issueInternalChallenge(
      db,
      { purpose: 'change-password', ipKey: 'unknown', now },
      process.env,
    );
    const { token } = createSession(db, userId, 'FULLY_AUTHENTICATED');

    const response = await post(changePassword, '/api/auth/change-password', token, {
      ...valid(),
      captcha: {
        challengeId: issued.publicChallenge.challengeId,
        answer: issued.expectedAnswer,
      },
    });

    expect(response.status).toBe(200);
    expect(verifyPassword).toHaveBeenCalled();
  });
});
