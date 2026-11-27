---
status: accepted
date: 2026-11-27
---

# Use server-side revocable cookie sessions instead of JWT

## Context and problem statement

Authentication state must survive requests. It also has to be revocable at once: on logout,
password change, role change, account lock and by an administrator.

## Considered options

- Stateless signed JWT in a cookie or header.
- Opaque random token in an HttpOnly cookie, with the session as a database row.

## Decision outcome

Opaque token: 32 bytes from `crypto.randomBytes`, base64url. Only its SHA-256 digest is stored
(`sessions.token_hash`). The cookie is HttpOnly and the session row decides validity on every
request. Login revokes a session cookie the request already carried (no session fixation).

## Consequences

- Good: revocation is a row update and takes effect on the next request.
- Good: a database copy cannot be replayed as a cookie because only digests are stored.
- Bad: every request reads the sessions table; this is why the store later needs a real database
  (ADR 0010).
- Bad: no stateless horizontal scaling without shared storage.

## Related

[architecture, Sessions](../architecture.md#sessions), [ADR 0004](0004-csrf-origin-check-and-hmac-double-submit.md)
