import { NextRequest } from 'next/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { hashPassword, verifyPassword } from '../../../../server/auth/password-hasher';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { loginAttempts, securityEvents } from '../../../../server/db/schema';
import {
  InternalCaptchaProvider,
  issueInternalChallenge,
} from '../../../../server/security/captcha/internal';
import { POST } from './route';

vi.mock('../../../../server/auth/password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../server/auth/password-hasher')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const T0 = new Date('2026-11-04T12:00:00.000Z');
const PASSWORD = 'Correct horse battery staple';
const env = { CAPTCHA_HMAC_SECRET: 'login-route-hmac-secret' };
const fakeClock = new FakeClock(T0);
let passwordHash: string;

setUpSharedTestDb();

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  vi.stubEnv('CAPTCHA_LOGIN_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_HMAC_SECRET', env.CAPTCHA_HMAC_SECRET);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.mocked(verifyPassword).mockClear();
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

function post(captcha?: { challengeId: string; answer: string }) {
  return POST(
    new NextRequest('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
      body: JSON.stringify({
        login: 'employee1',
        password: 'wrong password',
        ...(captcha && { captcha }),
      }),
    }),
  );
}

function issue() {
  return issueInternalChallenge(
    db,
    { purpose: 'login', ipKey: 'unknown', now: fakeClock.now() },
    env,
  );
}

function proof(challenge: ReturnType<typeof issue>, answer = challenge.expectedAnswer) {
  return { challengeId: challenge.publicChallenge.challengeId, answer };
}

function attempts() {
  return db.select().from(loginAttempts).all();
}

describe('POST /api/auth/login CAPTCHA precondition', () => {
  it('returns CAPTCHA_REQUIRED before password verification or account-lock reservation (SEC-40)', async () => {
    insertUser(db, { login: 'employee1', passwordHash });

    const response = await post();

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('CAPTCHA_REQUIRED');
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(attempts()).toMatchObject([
      { loginNormalized: null, kind: 'CAPTCHA', outcome: 'FAILED', ipKey: 'unknown' },
    ]);
  });

  it('rejects wrong, expired and already-used challenges against the IP only (SEC-41)', async () => {
    insertUser(db, { login: 'employee1', passwordHash });

    const wrong = issue();
    const wrongAnswer = wrong.expectedAnswer === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    expect((await post(proof(wrong, wrongAnswer))).status).toBe(403);

    const expired = issue();
    fakeClock.advance(121_000);
    expect((await post(proof(expired))).status).toBe(403);

    fakeClock.set(T0);
    const used = issue();
    const provider = new InternalCaptchaProvider(db, env);
    await expect(
      provider.verify(proof(used), { purpose: 'login', ipKey: 'unknown', now: T0 }),
    ).resolves.toEqual({ ok: true });
    expect((await post(proof(used))).status).toBe(403);

    expect(verifyPassword).not.toHaveBeenCalled();
    expect(attempts()).toHaveLength(3);
    expect(attempts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loginNormalized: null, kind: 'CAPTCHA', outcome: 'FAILED' }),
      ]),
    );
    expect(attempts().every((attempt) => attempt.loginNormalized === null)).toBe(true);
    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .map((event) => event.type),
    ).toContain('CAPTCHA_FAILED');
  });

  it('lets a fresh reversed answer reach generic credential handling and account counting', async () => {
    insertUser(db, { login: 'employee1', passwordHash });
    const challenge = issue();

    const response = await post(proof(challenge));

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(verifyPassword).toHaveBeenCalledOnce();
    expect(attempts()).toMatchObject([
      {
        loginNormalized: 'employee1',
        kind: 'CREDENTIAL',
        outcome: 'FAILED',
        ipKey: 'unknown',
      },
    ]);

    const replay = await post(proof(challenge));
    expect(replay.status).toBe(403);
    expect(verifyPassword).toHaveBeenCalledOnce();
  });
});
