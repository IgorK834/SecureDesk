---
status: superseded by 0008-redis-fail-closed-policy.md
date: 2026-11-27
---

# Keep rate limiting and attempt tracking in process memory

## Context and problem statement

Login throttling, CAPTCHA and TOTP limits need counters. The course deployment is one Node process.

## Considered options

- In-memory maps in the server process.
- A shared store (Redis) from the start.

## Decision outcome

In-memory counters in `server/security/rate-limiter.ts` and `attempt-tracker.ts`, keyed by the
client address from `client-ip.ts` (`TRUST_PROXY` and `TRUSTED_PROXY_HOPS`, rightmost forwarded
entry), plus a separate per-login lock.

## Consequences

- Good: no extra infrastructure; trivial to test.
- Bad: counters reset on restart and are not shared across instances, so the effective limit
  multiplies with the instance count.
- Superseded because the platform module moves shared state to Redis with an explicit outage
  policy.

## Related

[ADR 0008](0008-redis-fail-closed-policy.md), [architecture](../architecture.md)
