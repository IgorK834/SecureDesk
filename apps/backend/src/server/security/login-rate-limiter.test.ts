import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import {
  LOGIN_IP_ATTEMPT_LIMIT,
  loginRateLimiter,
  resetLoginRateLimiterForTests,
} from './login-rate-limiter';

const fakeClock = new FakeClock();

beforeEach(() => {
  fakeClock.install();
});

afterEach(() => {
  vi.unstubAllEnvs();
  fakeClock.uninstall();
  resetLoginRateLimiterForTests();
});

describe('loginRateLimiter address window (SEC-27)', () => {
  it('refuses the 31st attempt from one address even when every submitted login differs', async () => {
    for (let attempt = 0; attempt < LOGIN_IP_ATTEMPT_LIMIT; attempt++) {
      expect(await loginRateLimiter.check('203.0.113.8', `login-${attempt}`)).toStrictEqual({
        allowed: true,
      });
    }

    expect(await loginRateLimiter.check('203.0.113.8', 'one-more-login')).toStrictEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
    expect(await loginRateLimiter.check('203.0.113.9', 'one-more-login')).toStrictEqual({
      allowed: true,
    });
  });

  it('cannot clear abuse counters through the test hook in production', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => resetLoginRateLimiterForTests()).toThrow(
      'resetLoginRateLimiterForTests() must not be called in production.',
    );
  });
});
