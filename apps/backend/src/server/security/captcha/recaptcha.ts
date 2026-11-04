import type {
  CaptchaFailure,
  CaptchaProvider,
  CaptchaPurpose,
  CaptchaVerificationResult,
} from './provider';
import {
  DEFAULT_CAPTCHA_MAX_TOKEN_AGE_SECONDS,
  DEFAULT_CAPTCHA_VERIFY_TIMEOUT_MS,
} from './turnstile';

export const RECAPTCHA_SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
export const DEFAULT_RECAPTCHA_MIN_SCORE = 0.5;
export const MAX_RECAPTCHA_TOKEN_LENGTH = 2_048;

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

interface RecaptchaResponse {
  success?: unknown;
  score?: unknown;
  action?: unknown;
  hostname?: unknown;
  challenge_ts?: unknown;
  'error-codes'?: unknown;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  return value !== undefined && /^[1-9]\d*$/.test(value) ? Number(value) : fallback;
}

function minimumScore(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_RECAPTCHA_MIN_SCORE;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1
    ? parsed
    : DEFAULT_RECAPTCHA_MIN_SCORE;
}

function tokenFrom(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('token' in input)) return undefined;
  const token = (input as { token?: unknown }).token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function recaptchaAction(purpose: CaptchaPurpose): string {
  return purpose === 'change-password' ? 'change_password' : purpose;
}

function errorCodes(body: RecaptchaResponse): string[] {
  return Array.isArray(body['error-codes'])
    ? body['error-codes'].filter((value): value is string => typeof value === 'string')
    : [];
}

function failedReason(body: RecaptchaResponse, now: Date, maxAgeMs: number): CaptchaFailure {
  const codes = errorCodes(body);
  if (codes.includes('missing-input-response')) return 'MISSING';
  if (codes.includes('timeout-or-duplicate')) {
    const challengedAt =
      typeof body.challenge_ts === 'string' ? Date.parse(body.challenge_ts) : Number.NaN;
    return Number.isFinite(challengedAt) && now.getTime() - challengedAt > maxAgeMs
      ? 'EXPIRED'
      : 'DUPLICATE';
  }
  if (
    codes.includes('missing-input-secret') ||
    codes.includes('invalid-input-secret') ||
    codes.includes('bad-request')
  ) {
    return 'UNAVAILABLE';
  }
  return 'INVALID';
}

/** Google reCAPTCHA v3 adapter using the still-supported siteverify flow. */
export class RecaptchaProvider implements CaptchaProvider {
  readonly id = 'recaptcha' as const;

  constructor(
    private readonly env: Env = process.env,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  publicConfig(purpose: CaptchaPurpose) {
    return {
      provider: this.id,
      siteKey: this.env.RECAPTCHA_SITE_KEY?.trim(),
      action: recaptchaAction(purpose),
    };
  }

  async verify(
    input: unknown,
    ctx: { purpose: CaptchaPurpose; ipKey: string; now: Date },
  ): Promise<CaptchaVerificationResult> {
    const token = tokenFrom(input);
    if (!token) return { ok: false, reason: 'MISSING' };
    if (token.length > MAX_RECAPTCHA_TOKEN_LENGTH) return { ok: false, reason: 'INVALID' };

    const secret = this.env.RECAPTCHA_SECRET_KEY?.trim();
    const hostname = this.env.CAPTCHA_EXPECTED_HOSTNAME?.trim();
    if (!secret || !hostname) return { ok: false, reason: 'UNAVAILABLE' };

    const timeout = positiveInteger(
      this.env.CAPTCHA_VERIFY_TIMEOUT_MS,
      DEFAULT_CAPTCHA_VERIFY_TIMEOUT_MS,
    );
    const verifyUrl =
      this.env.NODE_ENV === 'production'
        ? RECAPTCHA_SITEVERIFY_URL
        : (this.env.RECAPTCHA_VERIFY_URL?.trim() ?? RECAPTCHA_SITEVERIFY_URL);

    let response: Response;
    try {
      response = await this.fetchImpl(verifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token, remoteip: ctx.ipKey }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      const providerErrorCause =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
          ? ('TIMEOUT' as const)
          : ('HTTP_ERROR' as const);
      return { ok: false, reason: 'UNAVAILABLE', providerErrorCause };
    }
    if (!response.ok) {
      return { ok: false, reason: 'UNAVAILABLE', providerErrorCause: 'HTTP_ERROR' };
    }

    let body: RecaptchaResponse;
    try {
      body = (await response.json()) as RecaptchaResponse;
    } catch {
      return { ok: false, reason: 'UNAVAILABLE', providerErrorCause: 'BAD_RESPONSE' };
    }

    const maxAgeMs =
      positiveInteger(
        this.env.CAPTCHA_MAX_TOKEN_AGE_SECONDS,
        DEFAULT_CAPTCHA_MAX_TOKEN_AGE_SECONDS,
      ) * 1_000;
    const codes = errorCodes(body);
    // Google documents quota cases where siteverify can report success while also returning an
    // error. The application rejects every such response to preserve its fail-closed contract.
    if (body.success !== true || codes.length > 0) {
      const reason = failedReason(body, ctx.now, maxAgeMs);
      return {
        ok: false,
        reason,
        ...(reason === 'UNAVAILABLE' && { providerErrorCause: 'BAD_RESPONSE' as const }),
      };
    }
    if (body.action !== recaptchaAction(ctx.purpose)) return { ok: false, reason: 'WRONG_ACTION' };
    if (body.hostname !== hostname) return { ok: false, reason: 'WRONG_HOSTNAME' };
    if (typeof body.challenge_ts !== 'string') return { ok: false, reason: 'INVALID' };

    const challengedAt = Date.parse(body.challenge_ts);
    if (!Number.isFinite(challengedAt) || challengedAt > ctx.now.getTime()) {
      return { ok: false, reason: 'INVALID' };
    }
    if (ctx.now.getTime() - challengedAt > maxAgeMs) return { ok: false, reason: 'EXPIRED' };
    if (typeof body.score !== 'number' || body.score < minimumScore(this.env.RECAPTCHA_MIN_SCORE)) {
      return { ok: false, reason: 'INVALID' };
    }

    return { ok: true };
  }
}
