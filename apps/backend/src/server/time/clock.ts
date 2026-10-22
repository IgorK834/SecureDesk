/**
 * The single source of "now" for everything whose behaviour depends on time (session
 * idle/absolute expiry, the 12-hour temporary-password lifetime, row timestamps). Code reads
 * time through `clock`, never through `new Date()` directly, so tests can move time instead
 * of waiting for it.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

let active: Clock = systemClock;

/** What application code uses. Delegates to whichever clock is currently active. */
export const clock: Clock = { now: () => active.now() };

/**
 * Replaces the active clock; call with no argument to restore the system clock. It refuses to
 * run in production, because a rewindable clock would defeat every expiry check.
 */
export function setClockForTests(replacement: Clock = systemClock): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('setClockForTests() must not be called in production.');
  }
  active = replacement;
}
