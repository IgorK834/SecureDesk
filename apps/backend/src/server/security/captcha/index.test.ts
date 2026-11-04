import { describe, expect, it } from 'vitest';
import { CaptchaConfigError, assertCaptchaConfig, getCaptchaProvider } from '.';

const production = {
  NODE_ENV: 'production',
  CAPTCHA_LOGIN_PROVIDER: 'internal',
  CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'turnstile',
  CAPTCHA_HMAC_SECRET: 'internal-secret',
  TURNSTILE_SITE_KEY: 'real-site-key',
  TURNSTILE_SECRET_KEY: 'real-secret-key',
  CAPTCHA_EXPECTED_HOSTNAME: 'securedesk.example',
};

describe('CAPTCHA configuration', () => {
  it('accepts a complete production configuration and resolves each form on the server', () => {
    expect(() => assertCaptchaConfig(production)).not.toThrow();
    expect(getCaptchaProvider('login', production).id).toBe('internal');
    expect(getCaptchaProvider('change-password', production).id).toBe('turnstile');
  });

  it.each([
    ['TURNSTILE_SITE_KEY', '1x00000000000000000000AA'],
    ['TURNSTILE_SITE_KEY', '2x00000000000000000000AB'],
    ['TURNSTILE_SECRET_KEY', '3x0000000000000000000000000000000AA'],
  ])('refuses production dummy value in %s', (key, value) => {
    expect(() => assertCaptchaConfig({ ...production, [key]: value })).toThrow(CaptchaConfigError);
  });

  it.each([
    'TURNSTILE_SITE_KEY',
    'TURNSTILE_SECRET_KEY',
    'CAPTCHA_EXPECTED_HOSTNAME',
    'CAPTCHA_HMAC_SECRET',
  ])('refuses missing selected-provider setting %s', (key) => {
    expect(() => assertCaptchaConfig({ ...production, [key]: undefined })).toThrow(
      CaptchaConfigError,
    );
  });

  it.each(['TURNSTILE_VERIFY_URL', 'RECAPTCHA_VERIFY_URL', 'CAPTCHA_TEST_MODE'])(
    'refuses production test override %s even when its value looks disabled',
    (key) => {
      expect(() => assertCaptchaConfig({ ...production, [key]: 'false' })).toThrow(
        CaptchaConfigError,
      );
    },
  );

  it('refuses an unknown provider instead of silently disabling CAPTCHA', () => {
    expect(() => assertCaptchaConfig({ ...production, CAPTCHA_LOGIN_PROVIDER: 'none' })).toThrow(
      /CAPTCHA_LOGIN_PROVIDER/,
    );
  });

  it('validates the optional internal fallback and its HMAC secret', () => {
    expect(() =>
      assertCaptchaConfig({ ...production, CAPTCHA_FALLBACK: 'internal' }),
    ).not.toThrow();
    expect(() =>
      assertCaptchaConfig({
        ...production,
        CAPTCHA_FALLBACK: 'internal',
        CAPTCHA_HMAC_SECRET: undefined,
      }),
    ).toThrow(/CAPTCHA_HMAC_SECRET/);
    expect(() => assertCaptchaConfig({ ...production, CAPTCHA_FALLBACK: 'recaptcha' })).toThrow(
      /CAPTCHA_FALLBACK/,
    );
  });

  it('resolves the internal provider without exposing its secret and keeps reCAPTCHA fail-closed', async () => {
    const internal = getCaptchaProvider('login', production);
    expect(internal.publicConfig('login')).toStrictEqual({ provider: 'internal', action: 'login' });
    await expect(
      internal.verify(undefined, { purpose: 'login', ipKey: 'unknown', now: new Date() }),
    ).resolves.toStrictEqual({ ok: false, reason: 'MISSING' });

    const recaptchaEnv = {
      ...production,
      CAPTCHA_LOGIN_PROVIDER: 'recaptcha',
      CAPTCHA_PASSWORD_CHANGE_PROVIDER: 'recaptcha',
      RECAPTCHA_SITE_KEY: 'recaptcha-site',
      RECAPTCHA_SECRET_KEY: 'recaptcha-secret',
    };
    expect(() => assertCaptchaConfig(recaptchaEnv)).not.toThrow();
    expect(getCaptchaProvider('login', recaptchaEnv).publicConfig('login')).toStrictEqual({
      provider: 'recaptcha',
      siteKey: 'recaptcha-site',
      action: 'login',
    });
  });
});
