import type { NextRequest } from 'next/server';
import type { Clock } from '../time/clock';

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** In-memory sliding windows. Entries are process-local and intentionally contain no user data. */
export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly clock: Clock) {}

  /** Checks a window and records this attempt only when it is admitted. */
  consume(key: string, limit: number, windowMs: number): RateLimitDecision {
    const timestamps = this.current(key, windowMs);
    if (timestamps.length >= limit) return this.refusal(timestamps[0] as number, windowMs);
    timestamps.push(this.clock.now().getTime());
    this.hits.set(key, timestamps);
    return { allowed: true };
  }

  /** Checks a window without recording. Used before work whose eventual failure is counted. */
  check(key: string, limit: number, windowMs: number): RateLimitDecision {
    const timestamps = this.current(key, windowMs);
    return timestamps.length >= limit
      ? this.refusal(timestamps[0] as number, windowMs)
      : { allowed: true };
  }

  record(key: string, windowMs: number): void {
    const timestamps = this.current(key, windowMs);
    timestamps.push(this.clock.now().getTime());
    this.hits.set(key, timestamps);
  }

  clear(): void {
    this.hits.clear();
  }

  private current(key: string, windowMs: number): number[] {
    const cutoff = this.clock.now().getTime() - windowMs;
    const current = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (current.length === 0) this.hits.delete(key);
    else this.hits.set(key, current);
    return current;
  }

  private refusal(oldest: number, windowMs: number): RateLimitDecision {
    const remainingMs = oldest + windowMs - this.clock.now().getTime();
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
  }
}

/** Trust proxy-supplied client addresses only in deployments that explicitly enable it. */
export function getClientIp(request: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  // NextRequest does not expose the direct socket address. A trusted reverse proxy should be
  // enabled in deployed environments; this fallback deliberately ignores spoofable headers.
  return 'unknown';
}
