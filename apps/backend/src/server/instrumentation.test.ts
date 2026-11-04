import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../instrumentation';

const complete = {
  NEXT_RUNTIME: 'nodejs',
  NODE_ENV: 'production',
  CAPTCHA_LOGIN_PROVIDER: 'internal',
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  CAPTCHA_HMAC_SECRET: 'internal-secret',
  TURNSTILE_SITE_KEY: 'production-site-key',
  TURNSTILE_SECRET_KEY: 'production-secret-key',
  CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.example',
  TRUST_PROXY: 'true',
};

function configure(overrides: Record<string, string> = {}): void {
  for (const [key, value] of Object.entries({ ...complete, ...overrides })) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('server startup CAPTCHA assertion (SEC-62)', () => {
  it.each([
    ['TURNSTILE_SITE_KEY', '1x00000000000000000000AA'],
    ['TURNSTILE_SECRET_KEY', '2x0000000000000000000000000000000AA'],
  ])('throws before startup with a Cloudflare dummy %s', async (key, value) => {
    configure({ [key]: value });
    await expect(register()).rejects.toThrow(/Cloudflare test key/);
  });

  it('accepts complete non-dummy production settings', async () => {
    configure();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(register()).resolves.toBeUndefined();

    expect(warning).not.toHaveBeenCalled();
  });

  it('does nothing in a non-Node runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    await expect(register()).resolves.toBeUndefined();
  });
});
