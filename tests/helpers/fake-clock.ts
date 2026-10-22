import { type Clock, setClockForTests } from '../../apps/backend/src/server/time/clock';

/**
 * A clock tests can move. Install it to make every `clock.now()` in the application return its
 * time; time then passes only when the test says so, which makes expiry boundaries exact.
 * Always `uninstall()` in `afterEach`, or the next test inherits a frozen clock.
 */
export class FakeClock implements Clock {
  private current: Date;

  constructor(start: Date | string = '2030-01-01T00:00:00.000Z') {
    this.current = new Date(start);
  }

  /** A copy, so a caller mutating the result cannot move the clock. */
  now(): Date {
    return new Date(this.current);
  }

  set(time: Date | string): void {
    this.current = new Date(time);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  install(): this {
    setClockForTests(this);
    return this;
  }

  uninstall(): void {
    setClockForTests();
  }
}
