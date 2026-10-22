import { afterEach, describe, expect, it, vi } from 'vitest';
import { clock, setClockForTests, systemClock } from './clock';

afterEach(() => {
  // Unstub first: resetting the clock is refused while NODE_ENV is "production".
  vi.unstubAllEnvs();
  setClockForTests();
});

describe('clock', () => {
  it('follows real time by default', () => {
    const before = Date.now();
    const reading = clock.now().getTime();

    expect(reading).toBeGreaterThanOrEqual(before);
    expect(reading).toBeLessThanOrEqual(Date.now());
    expect(systemClock.now()).toBeInstanceOf(Date);
  });

  it('lets a test move time, so a 12-hour expiry needs no 12-hour wait', () => {
    let current = new Date('2030-01-01T00:00:00.000Z');
    setClockForTests({ now: () => current });

    expect(clock.now()).toEqual(new Date('2030-01-01T00:00:00.000Z'));

    current = new Date(current.getTime() + 12 * 60 * 60 * 1000);
    expect(clock.now()).toEqual(new Date('2030-01-01T12:00:00.000Z'));
  });

  it('returns to the system clock when called without an argument', () => {
    setClockForTests({ now: () => new Date(0) });
    setClockForTests();

    expect(clock.now().getTime()).toBeGreaterThan(Date.UTC(2020, 0, 1));
  });

  it('refuses to replace the clock in production, where it would defeat every expiry check', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(() => setClockForTests({ now: () => new Date(0) })).toThrow(/production/);
    expect(clock.now().getTime()).toBeGreaterThan(Date.UTC(2020, 0, 1));
  });
});
