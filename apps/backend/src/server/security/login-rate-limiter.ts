import { clock } from '../time/clock';
import { type RateLimitDecision, SlidingWindowRateLimiter } from './rate-limiter';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_IP_ATTEMPT_LIMIT = 30;
export const LOGIN_PAIR_FAILURE_LIMIT = 5;

/**
 * Hook for throttling login attempts. `clientKey` identifies the caller (the client address) and
 * `normalizedLogin` the account being guessed; the login is used whether or not the account
 * exists, so throttling cannot reveal which logins are real.
 */
export interface LoginRateLimiter {
  check(clientKey: string, normalizedLogin: string): Promise<RateLimitDecision>;
  recordFailure(clientKey: string, normalizedLogin: string): void;
}

const windows = new SlidingWindowRateLimiter(clock);
const ipKey = (ip: string) => `ip:${ip}`;
const pairKey = (ip: string, login: string) => `pair:${JSON.stringify([ip, login])}`;

/**
 * Per-process login throttling. It is lost on restart; deployments with more than one backend
 * process must replace this store with a shared atomic store such as Redis.
 */
export const loginRateLimiter: LoginRateLimiter = {
  async check(clientKey, normalizedLogin) {
    const byIp = windows.consume(
      ipKey(clientKey),
      LOGIN_IP_ATTEMPT_LIMIT,
      LOGIN_RATE_LIMIT_WINDOW_MS,
    );
    if (!byIp.allowed) return byIp;
    return windows.check(
      pairKey(clientKey, normalizedLogin),
      LOGIN_PAIR_FAILURE_LIMIT,
      LOGIN_RATE_LIMIT_WINDOW_MS,
    );
  },
  recordFailure(clientKey, normalizedLogin) {
    windows.record(pairKey(clientKey, normalizedLogin), LOGIN_RATE_LIMIT_WINDOW_MS);
  },
};

/** Keeps deterministic tests isolated. Production code must never reset abuse counters. */
export function resetLoginRateLimiterForTests(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('resetLoginRateLimiterForTests() must not be called in production.');
  }
  windows.clear();
}
