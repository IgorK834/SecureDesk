import { describe, expect, it, vi } from 'vitest';
import { TurnstileProvider } from './turnstile';

const NOW = new Date('2030-01-01T00:02:00.000Z');
const env = {
  NODE_ENV: 'test',
  TURNSTILE_SITE_KEY: 'site-key',
  TURNSTILE_SECRET_KEY: 'secret-value',
  TURNSTILE_VERIFY_URL: 'http://stub.test/siteverify',
  CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.test',
  CAPTCHA_MAX_TOKEN_AGE_SECONDS: '120',
  CAPTCHA_VERIFY_TIMEOUT_MS: '3000',
};
const context = { purpose: 'change-password' as const, ipKey: '203.0.113.8', now: NOW };
const passed = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      success: true,
      action: 'change-password',
      hostname: 'securedesk.test',
      challenge_ts: '2030-01-01T00:00:00.000Z',
      ...overrides,
    }),
    { status: 200 },
  );

function provider(response: Response | Error) {
  const fetchStub = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return {
    fetchStub,
    provider: new TurnstileProvider(env, fetchStub as unknown as typeof fetch),
  };
}

describe('TurnstileProvider response binding and freshness (SEC-42)', () => {
  it('publishes only the site key and action, then accepts a bound, fresh success', async () => {
    const { fetchStub, provider: turnstile } = provider(passed());

    expect(turnstile.publicConfig('change-password')).toStrictEqual({
      provider: 'turnstile',
      siteKey: 'site-key',
      action: 'change-password',
    });
    await expect(turnstile.verify({ token: 'proof' }, context)).resolves.toStrictEqual({
      ok: true,
    });

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://stub.test/siteverify');
    const sent = new URLSearchParams(init.body as URLSearchParams);
    expect(Object.fromEntries(sent)).toStrictEqual({
      secret: 'secret-value',
      response: 'proof',
      remoteip: '203.0.113.8',
    });
    expect(JSON.stringify(fetchStub.mock.calls)).not.toContain('secret-value');
  });

  it.each([
    ['wrong action', passed({ action: 'login' }), 'WRONG_ACTION'],
    ['wrong hostname', passed({ hostname: 'attacker.test' }), 'WRONG_HOSTNAME'],
    ['121 seconds old', passed({ challenge_ts: '2029-12-31T23:59:59.000Z' }), 'EXPIRED'],
    ['missing timestamp', passed({ challenge_ts: undefined }), 'INVALID'],
    ['future timestamp', passed({ challenge_ts: '2030-01-01T00:02:01.000Z' }), 'INVALID'],
  ])('rejects a %s response with %s', async (_label, response, reason) => {
    await expect(
      provider(response).provider.verify({ token: 'proof' }, context),
    ).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });

  it.each([
    [['missing-input-response'], 'MISSING'],
    [['invalid-input-response'], 'INVALID'],
    [['timeout-or-duplicate'], 'DUPLICATE'],
    [['internal-error'], 'UNAVAILABLE'],
  ])('maps Cloudflare error code %s to %s', async (codes, reason) => {
    const response = new Response(JSON.stringify({ success: false, 'error-codes': codes }));
    await expect(
      provider(response).provider.verify({ token: 'proof' }, context),
    ).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });

  it('rejects missing and oversized tokens without spending a provider call', async () => {
    const { fetchStub, provider: turnstile } = provider(passed());

    await expect(turnstile.verify(undefined, context)).resolves.toEqual({
      ok: false,
      reason: 'MISSING',
    });
    await expect(turnstile.verify({ token: 'x'.repeat(2049) }, context)).resolves.toEqual({
      ok: false,
      reason: 'INVALID',
    });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it.each([
    ['a network failure', new Error('network')],
    ['an HTTP 500', new Response('no', { status: 500 })],
    ['a malformed response', new Response('not json')],
  ])('fails closed on %s', async (_label, response) => {
    await expect(
      provider(response).provider.verify({ token: 'proof' }, context),
    ).resolves.toMatchObject({
      ok: false,
      reason: 'UNAVAILABLE',
    });
  });

  it('classifies a fetch timeout without logging the token, secret or provider response', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const fetchStub = vi.fn(async () => {
      throw timeout;
    });
    const logs: unknown[] = [];
    const spies = ['info', 'warn', 'error', 'log'].map((method) =>
      vi
        .spyOn(console, method as 'info')
        .mockImplementation((...args: unknown[]) => logs.push(args)),
    );
    const turnstile = new TurnstileProvider(env, fetchStub as unknown as typeof fetch);

    await expect(turnstile.verify({ token: 'private-proof' }, context)).resolves.toStrictEqual({
      ok: false,
      reason: 'UNAVAILABLE',
      providerErrorCause: 'TIMEOUT',
    });
    expect(fetchStub).toHaveBeenCalledOnce();
    expect(JSON.stringify(logs)).not.toMatch(/private-proof|secret-value|timed out/);
    spies.forEach((spy) => spy.mockRestore());
  });

  it('ignores the verification URL override in production', async () => {
    const fetchStub = vi.fn<typeof fetch>(async () => passed());
    const turnstile = new TurnstileProvider(
      { ...env, NODE_ENV: 'production' },
      fetchStub as unknown as typeof fetch,
    );

    await turnstile.verify({ token: 'proof' }, context);

    expect(fetchStub.mock.calls[0]?.[0]).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    );
  });
});
