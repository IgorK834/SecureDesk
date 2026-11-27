---
status: proposed
date: 2026-11-27
---

# Share limiter state in Redis and fail closed for security limiters

## Context and problem statement

Moving counters to Redis (superseding [ADR 0006](0006-process-local-rate-limiting.md)) adds a
dependency whose outage must have a defined effect. Failing open would let an attacker who can
disturb Redis remove the brakes on password guessing.

## Considered options

- Fail open everywhere: availability first.
- Fail closed everywhere: safety first.
- Per feature: security limiters fail closed, non-security caches fail open and log.

## Decision outcome

Per feature (decision D4-04). Login, password change, TOTP and reset limiters answer
`503 SERVICE_UNAVAILABLE` before any credential check when Redis is unreachable. Read-only
endpoints and the health endpoint keep working. The table lives in code as `sharedStatePolicy`.

## Consequences

- Good: a Redis outage cannot be used to bypass throttling.
- Bad: a Redis outage blocks sign-in until it is back.

## Related

SD-110, SD-111 in the Module 4 backlog.
