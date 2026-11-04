import { describe, expect, it, vi } from 'vitest';
import { RECAPTCHA_SITEVERIFY_URL, RecaptchaProvider } from './recaptcha';

const NOW = new Date('2030-01-01T00:02:00.000Z');
const env = {
  NODE_ENV: 'test',
  RECAPTCHA_SITE_KEY: 'site-key',
  RECAPTCHA_SECRET_KEY: 'secret-value',
  RECAPTCHA_VERIFY_URL: 'http://stub.test/siteverify',
  CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.test',
  CAPTCHA_MAX_TOKEN_AGE_SECONDS: '120',
};
const context = { purpose: 'change-password' as const, ipKey: '203.0.113.8', now: NOW };

const passed = (overrides: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      success: true,
      score: 0.9,
      action: 'change_password',
      hostname: 'securedesk.test',
      challenge_ts: '2030-01-01T00:01:00.000Z',
      ...overrides,
    }),
  );

function provider(response: Response | Error, overrides: Record<string, string> = {}) {
  const fetchStub = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return {
    fetchStub,
    provider: new RecaptchaProvider({ ...env, ...overrides }, fetchStub as unknown as typeof fetch),
  };
}

describe('RecaptchaProvider', () => {
  it('posts the secret, token and address without exposing them in public config', async () => {
    const { fetchStub, provider: recaptcha } = provider(passed());

    expect(recaptcha.publicConfig('change-password')).toEqual({
      provider: 'recaptcha',
      siteKey: 'site-key',
      action: 'change_password',
    });
    await expect(recaptcha.verify({ token: 'private-proof' }, context)).resolves.toEqual({
      ok: true,
    });

    const [url, init] = fetchStub.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://stub.test/siteverify');
    expect(Object.fromEntries(new URLSearchParams(init.body as URLSearchParams))).toEqual({
      secret: 'secret-value',
      response: 'private-proof',
      remoteip: '203.0.113.8',
    });
  });

  it.each([
    [['missing-input-response'], 'MISSING'],
    [['invalid-input-response'], 'INVALID'],
    [['timeout-or-duplicate'], 'DUPLICATE'],
    [['invalid-input-secret'], 'UNAVAILABLE'],
    [['bad-request'], 'UNAVAILABLE'],
  ])('maps Google error code %s to %s', async (codes, reason) => {
    await expect(
      provider(
        new Response(JSON.stringify({ success: false, 'error-codes': codes })),
      ).provider.verify({ token: 'proof' }, context),
    ).resolves.toMatchObject({ ok: false, reason });
  });

  it('rejects low scores and any error-bearing success response', async () => {
    await expect(
      provider(passed({ score: 0.49 })).provider.verify({ token: 'proof' }, context),
    ).resolves.toMatchObject({ ok: false, reason: 'INVALID' });
    await expect(
      provider(passed({ 'error-codes': ['over-quota'] })).provider.verify(
        { token: 'proof' },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, reason: 'INVALID' });
  });

  it('rejects missing, oversized, malformed, non-2xx and unavailable responses', async () => {
    const valid = provider(passed());
    await expect(valid.provider.verify(undefined, context)).resolves.toMatchObject({
      ok: false,
      reason: 'MISSING',
    });
    await expect(
      valid.provider.verify({ token: 'x'.repeat(2_049) }, context),
    ).resolves.toMatchObject({ ok: false, reason: 'INVALID' });
    expect(valid.fetchStub).not.toHaveBeenCalled();

    for (const response of [new Response('bad json'), new Response('down', { status: 500 })]) {
      await expect(
        provider(response).provider.verify({ token: 'proof' }, context),
      ).resolves.toMatchObject({
        ok: false,
        reason: 'UNAVAILABLE',
      });
    }
  });

  it('ignores the verification URL override in production', async () => {
    const { fetchStub, provider: recaptcha } = provider(passed(), { NODE_ENV: 'production' });
    await recaptcha.verify({ token: 'proof' }, context);
    expect(fetchStub.mock.calls[0]?.[0]).toBe(RECAPTCHA_SITEVERIFY_URL);
  });
});
