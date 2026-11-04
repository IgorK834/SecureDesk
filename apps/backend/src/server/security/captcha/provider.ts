export type CaptchaPurpose = 'login' | 'change-password';

export type CaptchaFailure =
  | 'MISSING'
  | 'INVALID'
  | 'EXPIRED'
  | 'DUPLICATE'
  | 'WRONG_ACTION'
  | 'WRONG_HOSTNAME'
  | 'UNAVAILABLE';

export type CaptchaProviderErrorCause = 'TIMEOUT' | 'HTTP_ERROR' | 'BAD_RESPONSE';

export type CaptchaVerificationResult =
  | { ok: true }
  | {
      ok: false;
      reason: CaptchaFailure;
      /** Safe operational category; never includes a provider response or request value. */
      providerErrorCause?: CaptchaProviderErrorCause;
    };

export interface CaptchaPublicConfig {
  provider: string;
  siteKey?: string;
  action: string;
}

export interface CaptchaProvider {
  readonly id: 'turnstile' | 'internal' | 'recaptcha';
  publicConfig(purpose: CaptchaPurpose): CaptchaPublicConfig;
  verify(
    input: unknown,
    ctx: { purpose: CaptchaPurpose; ipKey: string; now: Date },
  ): Promise<CaptchaVerificationResult>;
}
