import type {
  CaptchaFailure,
  CaptchaProvider,
  CaptchaPurpose,
  CaptchaVerificationResult,
} from './provider';

export const TURNSTILE_SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const DEFAULT_CAPTCHA_VERIFY_TIMEOUT_MS = 3_000;
export const DEFAULT_CAPTCHA_MAX_TOKEN_AGE_SECONDS = 120;
export const MAX_TURNSTILE_TOKEN_LENGTH = 2_048;

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

interface TurnstileResponse {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  challenge_ts?: unknown;
  'error-codes'?: unknown;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  return value !== undefined && /^[1-9]\d*$/.test(value) ? Number(value) : fallback;
}

function tokenFrom(input: unknown): string | undefined {
  if (typeof input !== 'object' || input === null || !('token' in input)) return undefined;
  const token = (input as { token?: unknown }).token;
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

function errorCodes(body: TurnstileResponse): string[] {
  return Array.isArray(body['error-codes'])
    ? body['error-codes'].filter((value): value is string => typeof value === 'string')
    : [];
}

function failedReason(body: TurnstileResponse, now: Date, maxAgeMs: number): CaptchaFailure {
  const codes = errorCodes(body);
  if (codes.includes('missing-input-response')) return 'MISSING';
  if (codes.includes('timeout-or-duplicate')) {
    const challengedAt =
      typeof body.challenge_ts === 'string' ? Date.parse(body.challenge_ts) : Number.NaN;
    return Number.isFinite(challengedAt) && now.getTime() - challengedAt > maxAgeMs
      ? 'EXPIRED'
      : 'DUPLICATE';
  }
  if (codes.includes('internal-error')) return 'UNAVAILABLE';
  return 'INVALID';
}

/** Cloudflare Turnstile adapter. It performs exactly one verification request and fails closed. */
export class TurnstileProvider implements CaptchaProvider {
  readonly id = 'turnstile' as const;

  constructor(
    private readonly env: Env = process.env,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  publicConfig(purpose: CaptchaPurpose) {
    return {
      provider: this.id,
      siteKey: this.env.TURNSTILE_SITE_KEY?.trim(),
      action: purpose,
    };
  }

  async verify(
    input: unknown,
    ctx: { purpose: CaptchaPurpose; ipKey: string; now: Date },
  ): Promise<CaptchaVerificationResult> {
    const token = tokenFrom(input);
    if (!token) return { ok: false, reason: 'MISSING' };
    if (token.length > MAX_TURNSTILE_TOKEN_LENGTH) return { ok: false, reason: 'INVALID' };

    const secret = this.env.TURNSTILE_SECRET_KEY?.trim();
    const hostname = this.env.CAPTCHA_EXPECTED_HOSTNAME?.trim();
    if (!secret || !hostname) return { ok: false, reason: 'UNAVAILABLE' };

    const timeout = positiveInteger(
      this.env.CAPTCHA_VERIFY_TIMEOUT_MS,
      DEFAULT_CAPTCHA_VERIFY_TIMEOUT_MS,
    );
    const verifyUrl =
      this.env.NODE_ENV === 'production'
        ? TURNSTILE_SITEVERIFY_URL
        : (this.env.TURNSTILE_VERIFY_URL?.trim() ?? TURNSTILE_SITEVERIFY_URL);

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

    let body: TurnstileResponse;
    try {
      body = (await response.json()) as TurnstileResponse;
    } catch {
      return { ok: false, reason: 'UNAVAILABLE', providerErrorCause: 'BAD_RESPONSE' };
    }

    const maxAgeMs =
      positiveInteger(
        this.env.CAPTCHA_MAX_TOKEN_AGE_SECONDS,
        DEFAULT_CAPTCHA_MAX_TOKEN_AGE_SECONDS,
      ) * 1_000;
    if (body.success !== true) {
      const reason = failedReason(body, ctx.now, maxAgeMs);
      return {
        ok: false,
        reason,
        ...(reason === 'UNAVAILABLE' && { providerErrorCause: 'BAD_RESPONSE' as const }),
      };
    }
    if (body.action !== ctx.purpose) return { ok: false, reason: 'WRONG_ACTION' };
    if (body.hostname !== hostname) return { ok: false, reason: 'WRONG_HOSTNAME' };
    if (typeof body.challenge_ts !== 'string') return { ok: false, reason: 'INVALID' };

    const challengedAt = Date.parse(body.challenge_ts);
    if (!Number.isFinite(challengedAt) || challengedAt > ctx.now.getTime()) {
      return { ok: false, reason: 'INVALID' };
    }
    if (ctx.now.getTime() - challengedAt > maxAgeMs) return { ok: false, reason: 'EXPIRED' };

    return { ok: true };
  }
}
