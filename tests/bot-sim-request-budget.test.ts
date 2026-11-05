import { describe, expect, it } from 'vitest';
import {
  MAX_REQUESTS_PER_SECOND,
  MAX_TOTAL_REQUESTS,
  RequestBudget,
} from '../scripts/bot-sim/request-budget.ts';

describe('bot simulator request budget', () => {
  it('paces requests with an injected clock and never sleeps in real time', async () => {
    let now = 1_000;
    const delays: number[] = [];
    const budget = new RequestBudget({
      requestsPerSecond: 2,
      maxTotal: 3,
      now: () => now,
      wait: async (milliseconds) => {
        delays.push(milliseconds);
        now += milliseconds;
      },
    });

    await budget.claim();
    await budget.claim();
    await budget.claim();

    expect(delays).toStrictEqual([500, 500]);
    expect(budget.used).toBe(3);
    await expect(budget.claim()).rejects.toThrow(/budget exhausted/);
  });

  it('refuses a configured cap above either hard safety limit', () => {
    expect(() => new RequestBudget({ requestsPerSecond: MAX_REQUESTS_PER_SECOND + 1 })).toThrow();
    expect(() => new RequestBudget({ maxTotal: MAX_TOTAL_REQUESTS + 1 })).toThrow();
    expect(() => new RequestBudget({ requestsPerSecond: 0 })).toThrow();
    expect(() => new RequestBudget({ maxTotal: 0 })).toThrow();
  });
});
