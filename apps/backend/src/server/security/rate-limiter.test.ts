import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { getClientIp, SlidingWindowRateLimiter } from './rate-limiter';

const MINUTE_MS = 60_000;
const WINDOW_MS = 15 * MINUTE_MS;

describe('SlidingWindowRateLimiter (SEC-27)', () => {
  it('refuses the sixth hit in a five-hit window and reports when the key is usable again', () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowRateLimiter(clock);

    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(limiter.consume('one', 5, WINDOW_MS)).toStrictEqual({ allowed: true });
    }
    expect(limiter.consume('one', 5, WINDOW_MS)).toStrictEqual({
      allowed: false,
      retryAfterSeconds: 15 * 60,
    });
  });

  it('admits the key at the exact end of the window without sleeping', () => {
    const clock = new FakeClock();
    const limiter = new SlidingWindowRateLimiter(clock);
    limiter.consume('one', 1, WINDOW_MS);

    clock.advance(WINDOW_MS - 1);
    expect(limiter.consume('one', 1, WINDOW_MS)).toStrictEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    clock.advance(1);
    expect(limiter.consume('one', 1, WINDOW_MS)).toStrictEqual({ allowed: true });
  });

  it('keeps counters independent per key and clear removes all counters', () => {
    const limiter = new SlidingWindowRateLimiter(new FakeClock());

    expect(limiter.consume('first', 1, WINDOW_MS)).toStrictEqual({ allowed: true });
    expect(limiter.consume('first', 1, WINDOW_MS).allowed).toBe(false);
    expect(limiter.consume('second', 1, WINDOW_MS)).toStrictEqual({ allowed: true });

    limiter.clear();
    expect(limiter.consume('first', 1, WINDOW_MS)).toStrictEqual({ allowed: true });
  });

  it('supports checking before work and recording only a failed result', () => {
    const limiter = new SlidingWindowRateLimiter(new FakeClock());

    expect(limiter.check('pair', 1, WINDOW_MS)).toStrictEqual({ allowed: true });
    expect(limiter.check('pair', 1, WINDOW_MS)).toStrictEqual({ allowed: true });
    limiter.record('pair', WINDOW_MS);
    expect(limiter.check('pair', 1, WINDOW_MS).allowed).toBe(false);
  });
});

describe('getClientIp', () => {
  const request = () =>
    new NextRequest('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    });

  it('uses only the first forwarded address when TRUST_PROXY=true', () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    expect(getClientIp(request())).toBe('203.0.113.7');
  });

  it('ignores a spoofable forwarded address unless the proxy is trusted', () => {
    vi.stubEnv('TRUST_PROXY', 'false');
    expect(getClientIp(request())).toBe('unknown');
  });
});
