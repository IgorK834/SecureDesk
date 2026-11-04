import type { CaptchaPurpose, CaptchaVerificationResult } from './provider';

export const CAPTCHA_FALLBACK_FAILURE_THRESHOLD = 5;
export const CAPTCHA_FALLBACK_COOLDOWN_MS = 5 * 60 * 1_000;

type Env = Readonly<Record<string, string | undefined>>;

interface CircuitState {
  consecutiveUnavailable: number;
  openUntil?: Date;
  outageEventRecorded: boolean;
}

const state: CircuitState = { consecutiveUnavailable: 0, outageEventRecorded: false };

function enabled(purpose: CaptchaPurpose, env: Env): boolean {
  return (
    purpose === 'change-password' &&
    (env.CAPTCHA_PASSWORD_CHANGE_PROVIDER?.trim() || 'turnstile') === 'turnstile' &&
    env.CAPTCHA_FALLBACK?.trim() === 'internal'
  );
}

function close(): void {
  state.consecutiveUnavailable = 0;
  state.openUntil = undefined;
  state.outageEventRecorded = false;
}

export function isCaptchaFallbackOpen(purpose: CaptchaPurpose, env: Env, now: Date): boolean {
  if (!enabled(purpose, env)) return false;
  if (!state.openUntil) return false;
  if (state.openUntil > now) return true;
  close();
  return false;
}

export function observeTurnstileResult(
  purpose: CaptchaPurpose,
  env: Env,
  now: Date,
  result: CaptchaVerificationResult,
): { recordProviderError: boolean } {
  if (!enabled(purpose, env)) {
    return { recordProviderError: !result.ok && result.reason === 'UNAVAILABLE' };
  }

  if (result.ok || result.reason !== 'UNAVAILABLE') {
    close();
    return { recordProviderError: false };
  }

  const recordProviderError = !state.outageEventRecorded;
  state.outageEventRecorded = true;
  state.consecutiveUnavailable += 1;
  if (state.consecutiveUnavailable >= CAPTCHA_FALLBACK_FAILURE_THRESHOLD) {
    state.consecutiveUnavailable = 0;
    state.openUntil = new Date(now.getTime() + CAPTCHA_FALLBACK_COOLDOWN_MS);
  }
  return { recordProviderError };
}

export function resetCaptchaCircuitBreakerForTests(): void {
  close();
}
