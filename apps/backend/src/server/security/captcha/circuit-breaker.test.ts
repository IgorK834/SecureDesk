import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '../../db/__fixtures__/test-db';
import { securityEvents } from '../../db/schema';
import { CaptchaUnavailableError } from '../../http/errors';
import {
  CAPTCHA_FALLBACK_COOLDOWN_MS,
  CAPTCHA_FALLBACK_FAILURE_THRESHOLD,
  observeTurnstileResult,
  resetCaptchaCircuitBreakerForTests,
} from './circuit-breaker';
import { getCaptchaProvider, verifyCaptchaOrThrow } from '.';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const env = {
  CAPTCHA_LOGIN_PROVIDER: 'internal',
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  CAPTCHA_FALLBACK: 'internal',
  CAPTCHA_HMAC_SECRET: 'fallback-hmac-secret',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'secret-key',
  CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.test',
};
const unavailable = {
  ok: false as const,
  reason: 'UNAVAILABLE' as const,
  providerErrorCause: 'HTTP_ERROR' as const,
};

beforeEach(() => {
  resetCaptchaCircuitBreakerForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetCaptchaCircuitBreakerForTests();
});

describe('Turnstile internal fallback circuit breaker', () => {
  it('opens after five unavailable results and closes after five minutes', () => {
    const db = createMigratedDb();
    for (let count = 1; count < CAPTCHA_FALLBACK_FAILURE_THRESHOLD; count++) {
      observeTurnstileResult('change-password', env, T0, unavailable);
      expect(getCaptchaProvider('change-password', env, db, T0).id).toBe('turnstile');
    }
    observeTurnstileResult('change-password', env, T0, unavailable);

    expect(getCaptchaProvider('change-password', env, db, T0).id).toBe('internal');
    expect(
      getCaptchaProvider(
        'change-password',
        env,
        db,
        new Date(T0.getTime() + CAPTCHA_FALLBACK_COOLDOWN_MS - 1),
      ).id,
    ).toBe('internal');
    expect(
      getCaptchaProvider(
        'change-password',
        env,
        db,
        new Date(T0.getTime() + CAPTCHA_FALLBACK_COOLDOWN_MS),
      ).id,
    ).toBe('turnstile');
  });

  it('stays fail-closed without the fallback flag and never affects login', () => {
    const db = createMigratedDb();
    const disabled = { ...env, CAPTCHA_FALLBACK: undefined };
    for (let count = 0; count < CAPTCHA_FALLBACK_FAILURE_THRESHOLD + 2; count++) {
      observeTurnstileResult('change-password', disabled, T0, unavailable);
    }

    expect(getCaptchaProvider('change-password', disabled, db, T0).id).toBe('turnstile');
    expect(getCaptchaProvider('login', env, db, T0).id).toBe('internal');
  });

  it('records one provider event for an outage before serving internal challenges', async () => {
    const db = createMigratedDb();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('provider down', { status: 500 })),
    );

    for (let count = 0; count < CAPTCHA_FALLBACK_FAILURE_THRESHOLD; count++) {
      await expect(
        verifyCaptchaOrThrow(
          { token: `proof-${count}` },
          {
            db,
            purpose: 'change-password',
            ipKey: '203.0.113.9',
            now: new Date(T0.getTime() + count),
            requestId: `request-${count}`,
          },
        ),
      ).rejects.toBeInstanceOf(CaptchaUnavailableError);
    }

    expect(getCaptchaProvider('change-password', process.env, db, T0).id).toBe('internal');
    expect(getCaptchaProvider('login', process.env, db, T0).id).toBe('internal');
    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .filter((event) => event.type === 'CAPTCHA_PROVIDER_ERROR'),
    ).toHaveLength(1);
  });
});
