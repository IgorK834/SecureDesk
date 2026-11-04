import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import {
  CAPTCHA_FALLBACK_COOLDOWN_MS,
  CAPTCHA_FALLBACK_FAILURE_THRESHOLD,
  observeTurnstileResult,
  resetCaptchaCircuitBreakerForTests,
} from '../../../../server/security/captcha/circuit-breaker';
import { GET, clearCaptchaConfigRateLimitForTests } from './route';

const settings = {
  CAPTCHA_LOGIN_PROVIDER: 'internal',
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  CAPTCHA_HMAC_SECRET: 'internal-secret',
  TURNSTILE_SITE_KEY: 'public-site-key',
  TURNSTILE_SECRET_KEY: 'never-public-secret',
  CAPTCHA_EXPECTED_HOSTNAME: 'localhost',
};

const request = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/api/captcha/config?${query}`));
const fakeClock = new FakeClock('2030-01-01T00:00:00.000Z');

beforeEach(() => {
  clearCaptchaConfigRateLimitForTests();
  resetCaptchaCircuitBreakerForTests();
  for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fakeClock.uninstall();
  resetCaptchaCircuitBreakerForTests();
});

describe('GET /api/captcha/config', () => {
  it('returns only the provider, public site key and server-selected action', async () => {
    const response = await request('purpose=change-password');
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toStrictEqual({
      provider: 'turnstile',
      siteKey: 'public-site-key',
      action: 'change-password',
    });
    expect(text).not.toContain('never-public-secret');
  });

  it('returns the internal provider without inventing a public secret', async () => {
    const response = await request('purpose=login');
    expect(await response.json()).toStrictEqual({ provider: 'internal', action: 'login' });
  });

  it('returns the Google-compatible action without exposing the reCAPTCHA secret', async () => {
    vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'recaptcha');
    vi.stubEnv('RECAPTCHA_SITE_KEY', 'recaptcha-site-key');
    vi.stubEnv('RECAPTCHA_SECRET_KEY', 'never-public-recaptcha-secret');

    const response = await request('purpose=change-password');
    const text = await response.text();

    expect(JSON.parse(text)).toStrictEqual({
      provider: 'recaptcha',
      siteKey: 'recaptcha-site-key',
      action: 'change_password',
    });
    expect(text).not.toContain('never-public-recaptcha-secret');
  });

  it.each(['purpose=unknown', 'purpose=login&extra=x', ''])(
    'strictly rejects malformed query %s',
    async (query) => {
      expect((await request(query)).status).toBe(400);
    },
  );

  it('allows 60 requests per address and rate limits the next one', async () => {
    for (let count = 0; count < 60; count++) {
      expect((await request('purpose=login')).status).toBe(200);
    }
    const refused = await request('purpose=login');
    expect(refused.status).toBe(429);
    expect(refused.headers.get('Retry-After')).toBe('60');
  });

  it('reports internal during an enabled outage and Turnstile again after cooldown', async () => {
    fakeClock.install();
    vi.stubEnv('CAPTCHA_FALLBACK', 'internal');
    const unavailable = { ok: false as const, reason: 'UNAVAILABLE' as const };
    for (let count = 0; count < CAPTCHA_FALLBACK_FAILURE_THRESHOLD; count++) {
      observeTurnstileResult('change-password', process.env, fakeClock.now(), unavailable);
    }

    expect(await (await request('purpose=change-password')).json()).toEqual({
      provider: 'internal',
      action: 'change-password',
    });
    fakeClock.advance(CAPTCHA_FALLBACK_COOLDOWN_MS);
    clearCaptchaConfigRateLimitForTests();
    expect(await (await request('purpose=change-password')).json()).toEqual({
      provider: 'turnstile',
      siteKey: 'public-site-key',
      action: 'change-password',
    });
  });
});
