import type { AppDb } from '../../db/connection';
import { db as sharedDb } from '../../db/client';
import {
  CaptchaFailedError,
  CaptchaRequiredError,
  CaptchaUnavailableError,
} from '../../http/errors';
import { recordIpFailure } from '../attempt-tracker';
import { recordAggregated, recordSecurityEvent } from '../events';
import { clock } from '../../time/clock';
import { isCaptchaFallbackOpen, observeTurnstileResult } from './circuit-breaker';
import type { CaptchaProvider, CaptchaPurpose } from './provider';
import { InternalCaptchaProvider } from './internal';
import { RecaptchaProvider } from './recaptcha';
import { TurnstileProvider } from './turnstile';

type Env = Readonly<Record<string, string | undefined>>;
type CaptchaProviderId = CaptchaProvider['id'];

const PROVIDER_VARIABLE: Record<CaptchaPurpose, string> = {
  login: 'CAPTCHA_LOGIN_PROVIDER',
  'change-password': 'CAPTCHA_PASSWORD_CHANGE_PROVIDER',
};

const DEFAULT_PROVIDER: Record<CaptchaPurpose, CaptchaProviderId> = {
  login: 'internal',
  'change-password': 'turnstile',
};

const PROVIDERS = new Set<CaptchaProviderId>(['internal', 'turnstile', 'recaptcha']);
const CLOUDFLARE_DUMMY_KEY = /^[123]x/i;

export class CaptchaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptchaConfigError';
  }
}

function selectedProvider(purpose: CaptchaPurpose, env: Env): CaptchaProviderId {
  const variable = PROVIDER_VARIABLE[purpose];
  const value = env[variable]?.trim() || DEFAULT_PROVIDER[purpose];
  if (!PROVIDERS.has(value as CaptchaProviderId)) {
    throw new CaptchaConfigError(`${variable} must be turnstile, internal or recaptcha.`);
  }
  return value as CaptchaProviderId;
}

function required(env: Env, variable: string): string {
  const value = env[variable]?.trim();
  if (!value) throw new CaptchaConfigError(`${variable} must be set.`);
  return value;
}

/** Validates selected providers. Production additionally rejects every documented test bypass. */
export function assertCaptchaConfig(env: Env = process.env): void {
  const selected = new Set<CaptchaProviderId>([
    selectedProvider('login', env),
    selectedProvider('change-password', env),
  ]);

  if (selected.has('turnstile')) {
    const siteKey = required(env, 'TURNSTILE_SITE_KEY');
    const secret = required(env, 'TURNSTILE_SECRET_KEY');
    required(env, 'CAPTCHA_EXPECTED_HOSTNAME');
    if (env.NODE_ENV === 'production' && CLOUDFLARE_DUMMY_KEY.test(siteKey)) {
      throw new CaptchaConfigError('TURNSTILE_SITE_KEY must not be a Cloudflare test key.');
    }
    if (env.NODE_ENV === 'production' && CLOUDFLARE_DUMMY_KEY.test(secret)) {
      throw new CaptchaConfigError('TURNSTILE_SECRET_KEY must not be a Cloudflare test key.');
    }
  }
  const fallback = env.CAPTCHA_FALLBACK?.trim();
  if (fallback !== undefined && fallback !== '' && fallback !== 'internal') {
    throw new CaptchaConfigError('CAPTCHA_FALLBACK must be internal when set.');
  }
  if (selected.has('internal') || fallback === 'internal') required(env, 'CAPTCHA_HMAC_SECRET');
  if (selected.has('recaptcha')) {
    required(env, 'RECAPTCHA_SITE_KEY');
    required(env, 'RECAPTCHA_SECRET_KEY');
    required(env, 'CAPTCHA_EXPECTED_HOSTNAME');
  }

  if (env.NODE_ENV === 'production') {
    for (const variable of ['TURNSTILE_VERIFY_URL', 'RECAPTCHA_VERIFY_URL', 'CAPTCHA_TEST_MODE']) {
      if (env[variable] !== undefined) {
        throw new CaptchaConfigError(`${variable} is test-only and must not be set in production.`);
      }
    }
  }
}

/** Resolves the provider on every call, so the form never chooses or trusts its provider. */
export function getCaptchaProvider(
  purpose: CaptchaPurpose,
  env: Env = process.env,
  providerDb: AppDb = sharedDb,
  now: Date = clock.now(),
): CaptchaProvider {
  const id = selectedProvider(purpose, env);
  if (id === 'turnstile' && isCaptchaFallbackOpen(purpose, env, now)) {
    return new InternalCaptchaProvider(providerDb, env);
  }
  if (id === 'turnstile') return new TurnstileProvider(env);
  if (id === 'internal') return new InternalCaptchaProvider(providerDb, env);
  return new RecaptchaProvider(env);
}

export interface CaptchaVerificationContext {
  db: AppDb;
  purpose: CaptchaPurpose;
  ipKey: string;
  now: Date;
  requestId: string;
  userAgent?: string | null;
}

/** Verifies, audits and translates provider-neutral failures into the public HTTP contract. */
export async function verifyCaptchaOrThrow(
  input: unknown,
  context: CaptchaVerificationContext,
): Promise<void> {
  const provider = getCaptchaProvider(context.purpose, process.env, context.db, context.now);
  const result = await provider.verify(input, context);
  const { recordProviderError } =
    provider.id === 'turnstile'
      ? observeTurnstileResult(context.purpose, process.env, context.now, result)
      : { recordProviderError: !result.ok && result.reason === 'UNAVAILABLE' };
  if (result.ok) return;

  recordIpFailure(context.db, { ipKey: context.ipKey, kind: 'CAPTCHA', now: context.now });
  recordAggregated(context.db, {
    type: 'CAPTCHA_FAILED',
    requestId: context.requestId,
    ipKey: context.ipKey,
    userAgent: context.userAgent,
    details: { form: context.purpose },
  });

  if (result.reason === 'UNAVAILABLE') {
    if (recordProviderError) {
      recordSecurityEvent(context.db, {
        type: 'CAPTCHA_PROVIDER_ERROR',
        requestId: context.requestId,
        ipKey: context.ipKey,
        userAgent: context.userAgent,
        details: { provider: provider.id, cause: result.providerErrorCause ?? 'BAD_RESPONSE' },
      });
    }
    throw new CaptchaUnavailableError();
  }
  if (result.reason === 'MISSING') throw new CaptchaRequiredError();
  throw new CaptchaFailedError();
}
