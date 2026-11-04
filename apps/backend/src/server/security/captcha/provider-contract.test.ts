import { describe, expect, it, vi } from 'vitest';
import type { CaptchaProvider } from './provider';
import { RecaptchaProvider } from './recaptcha';
import { TurnstileProvider } from './turnstile';

const NOW = new Date('2030-01-01T00:02:00.000Z');
const context = { purpose: 'change-password' as const, ipKey: '203.0.113.8', now: NOW };

const adapters = [
  {
    name: 'Turnstile',
    make(fetchImpl: typeof fetch): CaptchaProvider {
      return new TurnstileProvider(
        {
          NODE_ENV: 'test',
          TURNSTILE_SITE_KEY: 'site-key',
          TURNSTILE_SECRET_KEY: 'secret',
          TURNSTILE_VERIFY_URL: 'http://stub.test/verify',
          CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.test',
        },
        fetchImpl,
      );
    },
    action: 'change-password',
    success: { success: true },
  },
  {
    name: 'reCAPTCHA',
    make(fetchImpl: typeof fetch): CaptchaProvider {
      return new RecaptchaProvider(
        {
          NODE_ENV: 'test',
          RECAPTCHA_SITE_KEY: 'site-key',
          RECAPTCHA_SECRET_KEY: 'secret',
          RECAPTCHA_VERIFY_URL: 'http://stub.test/verify',
          CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.test',
        },
        fetchImpl,
      );
    },
    action: 'change_password',
    success: { success: true, score: 0.9 },
  },
] as const;

function response(adapter: (typeof adapters)[number], overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      ...adapter.success,
      action: adapter.action,
      hostname: 'securedesk.test',
      challenge_ts: '2030-01-01T00:01:00.000Z',
      ...overrides,
    }),
  );
}

describe.each(adapters)('$name shared CAPTCHA adapter contract', (adapter) => {
  it('accepts a fresh token bound to the action and hostname', async () => {
    const provider = adapter.make(vi.fn(async () => response(adapter)) as unknown as typeof fetch);
    await expect(provider.verify({ token: 'proof' }, context)).resolves.toEqual({ ok: true });
  });

  it.each([
    ['wrong action', { action: 'login' }, 'WRONG_ACTION'],
    ['wrong hostname', { hostname: 'attacker.test' }, 'WRONG_HOSTNAME'],
    ['expired token', { challenge_ts: '2029-12-31T23:59:59.000Z' }, 'EXPIRED'],
  ])('rejects %s', async (_case, overrides, reason) => {
    const provider = adapter.make(
      vi.fn(async () => response(adapter, overrides)) as unknown as typeof fetch,
    );
    await expect(provider.verify({ token: 'proof' }, context)).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });

  it('fails closed on a provider timeout', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const provider = adapter.make(
      vi.fn(async () => {
        throw timeout;
      }) as unknown as typeof fetch,
    );
    await expect(provider.verify({ token: 'proof' }, context)).resolves.toEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      providerErrorCause: 'TIMEOUT',
    });
  });
});
