---
status: accepted
date: 2026-11-27
---

# Protect state-changing requests with an Origin check and an HMAC double-submit token

## Context and problem statement

Cookie authentication needs CSRF protection. `SameSite=Lax` alone is defence in depth and does not
cover every browser or same-site attacker.

## Considered options

- `SameSite` only.
- Synchronizer token stored per session in the database.
- Origin/Referer check plus a stateless double-submit token bound to the session.

## Decision outcome

POST, PATCH, PUT and DELETE must come from `APP_ORIGIN` (Origin, falling back to Referer) and carry
`X-XSRF-TOKEN` equal to the `XSRF-TOKEN` cookie. The token is
`base64url(HMAC-SHA256(CSRF_SECRET, session.id))`, compared with `timingSafeEqual`. The cookie is
deliberately not HttpOnly so Angular can echo it. Login has no session yet and requires the
same-origin check and a JSON content type.

## Consequences

- Good: no per-token storage; a token is useless for any other session.
- Good: two independent checks, so one bypass is not enough.
- Bad: `CSRF_SECRET` becomes a secret to manage; rotating it invalidates live tokens.

## Related

`apps/backend/src/server/security/csrf.ts`, [ADR 0002](0002-server-side-revocable-cookie-sessions.md)
