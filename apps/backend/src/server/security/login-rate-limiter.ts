export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Hook for throttling login attempts. `clientKey` identifies the caller (the client address) and
 * `normalizedLogin` the account being guessed; the login is used whether or not the account
 * exists, so throttling cannot reveal which logins are real.
 */
export interface LoginRateLimiter {
  check(clientKey: string, normalizedLogin: string): Promise<RateLimitDecision>;
}

/** Placeholder that lets every attempt through. Task 6.1 replaces it with a real limiter. */
export const loginRateLimiter: LoginRateLimiter = {
  check: () => Promise.resolve({ allowed: true }),
};
