---
status: accepted
date: 2026-11-27
---

# Split the Angular SPA from an API-only Next.js backend

## Context and problem statement

SecureDesk needs a browser UI and a security-sensitive HTTP API. The course assignment asks for an
Angular frontend. One codebase could serve both (Next.js with React), or the two can be separate
deployables.

## Considered options

- One Next.js application rendering the UI and the API.
- Angular SPA in `apps/frontend` plus a Next.js application in `apps/backend` that serves only
  `/api/**`.

## Decision outcome

The split. The backend renders no pages; the SPA is static files. Both live in one npm workspace
repository so contracts change in one pull request.

## Consequences

- Good: the API is the only place that enforces authentication, RBAC and CSRF, so the UI cannot
  weaken them. The SPA needs no secrets and can be served by any static host.
- Good: a client other than the SPA (scripts, later API keys) uses the same endpoints.
- Bad: two toolchains, a development proxy and cross-origin concerns (hence ADR 0004).
- Bad: the SPA's browser security headers need their own proxy (planned in SD-119).

## Related

[architecture](../architecture.md), [ADR 0004](0004-csrf-origin-check-and-hmac-double-submit.md)
