# Architecture

_Placeholder. To be written as the system takes shape (see the diagram in the root README)._

## Password hashing

All password hashing and verification goes through one module,
`apps/backend/src/server/auth/password-hasher.ts` (`hashPassword`, `verifyPassword`,
`needsRehash`, `getDummyHash`). Nothing else in the application hashes, compares or stores a
password.

### Algorithm and library

Passwords are stored only as **Argon2id** hashes, produced by the maintained
[`argon2`](https://www.npmjs.com/package/argon2) package (node-argon2 0.45.x, prebuilt binaries
around the reference Argon2 implementation). It is listed in `serverExternalPackages` so Next.js
loads the native module at runtime instead of bundling it.

Why an established library and not our own code: password hashing is exactly where home-made
cryptography fails (weak or missing salts, fast hashes, non-constant-time comparison, wrong
encoding). The library supplies the memory-hard function, the random salt, the encoding and the
comparison; this project only chooses parameters and validates input. No hashing primitive is
written by hand, and `crypto.createHash` is not used for passwords. Argon2id is the hybrid variant
of Argon2, the memory-hard winner of the Password Hashing Competition, and the first choice of the
OWASP Password Storage Cheat Sheet: it resists both GPU cracking (memory cost) and side-channel
attacks.

### Parameters

| Parameter   | Value                           | Where it comes from                        |
| ----------- | ------------------------------- | ------------------------------------------ |
| Variant     | Argon2id, version 19 (0x13)     | `ARGON2_OPTIONS.type`                      |
| Memory cost | 19456 KiB (19 MiB)              | OWASP minimum configuration for Argon2id   |
| Time cost   | 2 iterations                    | OWASP minimum configuration for Argon2id   |
| Parallelism | 1 lane                          | OWASP minimum configuration for Argon2id   |
| Salt        | 16 random bytes, new every hash | library default; the code never passes one |

The values are set explicitly in `ARGON2_OPTIONS`, never left to library defaults, so a change is
a visible diff. A test pins them.

**Measured** with `npm run bench:argon2 -- 30` on an Apple M4 Pro, Node 26.11.1 (30 runs after a
warm-up): `hashPassword` median 14.6 ms (mean 15.2, min 13.5, max 21.0); `verifyPassword` median
14.6 ms (mean 15.0, min 13.5, max 18.0).

That is a fast result: the OWASP values are a **minimum**, not a tuned target. Before deployment,
run the benchmark on the real hardware and raise `memoryCost` and/or `timeCost` as far as the
login latency budget allows, then update this table. Stored hashes keep working after a change:
each hash carries its own parameters, and `needsRehash(hash)` reports the ones made with weaker
settings so they can be upgraded after a successful login.

### Stored format

A PHC string, for example `$argon2id$v=19$m=19456,p=1,t=2$<salt>$<digest>`. The salt and the
parameters live inside the string, so no separate salt column exists. node-argon2 writes the
parameters alphabetically (`m`, `p`, `t`); this is the same set of values as the `m,t,p` order
used in the OWASP examples.

### Rules the module enforces

- **Input guards.** `hashPassword` rejects a non-string, an empty string and anything over 1024
  bytes with `InvalidPasswordInputError` before Argon2 runs, which bounds the CPU and memory one
  request can spend. The password is never trimmed or normalized, and the error never contains it.
- **Verification never throws.** `verifyPassword` returns `false` for a malformed, empty,
  SHA-256-style or non-Argon2id stored hash (the library alone would accept argon2i/argon2d
  hashes and throws on garbage), and for an unusable candidate.
- **Unknown users cost the same.** `getDummyHash()` is a real Argon2id hash of a random value, so
  the login flow can verify against it and spend the same time whether or not the account exists.
- **No logging.** Passwords and hashes are never logged.

## Login and sessions

`POST /api/auth/login` (`apps/backend/src/app/api/auth/login/route.ts`, logic in
`server/auth/login-service.ts`). Body: `{ "login": "...", "password": "..." }`, JSON only; any
other `Content-Type` is refused, because a cross-site HTML form can send `text/plain` without a CORS
preflight and could otherwise sign a victim into the attacker's account (login CSRF).

### Flow

1. The body is validated (strict schema; the login is trimmed and at most 64 characters, the
   password is at most 1024 characters and is **never** trimmed or normalized).
2. The rate-limit hook is asked about the client and the normalized login.
3. The account is looked up by normalized login, ignoring soft-deleted accounts.
4. **Exactly one** Argon2id verification happens, against the stored hash or, for an unknown
   login, against `getDummyHash()`, so response time does not show whether the login exists.
5. A blocked account, a wrong password, an unknown or deleted login and an expired temporary
   password all give the same result.
6. The session stage is chosen: `INITIAL_PASSWORD_CHANGE` while `must_change_password` is set,
   otherwise `PASSWORD_EXPIRED` if `password_max_age_days` is set and exceeded, otherwise
   `FULLY_AUTHENTICATED`.
7. A brand-new session is created; a session cookie the request already carried is revoked in the
   same transaction (prevents session fixation).

A temporary password is refused from the instant `temporary_password_expires_at <= now`. A NULL
expiry means no deadline (the seeded ADMIN's bootstrap password, see
[database-schema.md](database-schema.md#seeding)). If password expiry is enabled and an account has
no `password_changed_at`, it counts as expired.

### Responses

| Status | `error.code`               | When                                                               |
| ------ | -------------------------- | ------------------------------------------------------------------ |
| 200    | (none)                     | Valid credentials; sets the session cookie                         |
| 400    | `VALIDATION_ERROR`         | Not JSON, wrong type, missing/extra/oversized field                |
| 401    | `AUTH_INVALID_CREDENTIALS` | Every credential failure; byte-identical body and headers          |
| 429    | `AUTH_RATE_LIMITED`        | The rate-limit hook refused the attempt (`Retry-After` is sent)    |
| 500    | `INTERNAL_ERROR`           | Anything unexpected; nothing about the cause is returned or logged |

Every response is `Cache-Control: no-store`. Logging is limited to an event name and a request id
(`server/security/log-event.ts`, filtered by `redact.ts`); request bodies, passwords, hashes,
tokens and error messages (which can embed query parameters) are never logged.

### Provisional parts

These exist so login works end to end and are to be replaced or confirmed by later tasks:

| Part                | Current stand-in                                                    | Owner    |
| ------------------- | ------------------------------------------------------------------- | -------- |
| Session service     | `server/auth/session-service.ts`: create session, session cookie    | Task 2.3 |
| Session lifetime    | 8 hours absolute (`SESSION_LIFETIME_MS`); idle timeout not yet used | Task 2.3 |
| Session cookie      | `__Host-securedesk_session`, HttpOnly, Secure, SameSite=Lax, Path=/ | Task 2.3 |
| Route wrapper       | helpers local to `route.ts` (error shape, `no-store`, 500 mapping)  | Task 3.2 |
| Rate limiter        | `loginRateLimiter` allows everything                                | Task 6.1 |
| Rate-limiter client | first `X-Forwarded-For` entry if `TRUST_PROXY=true`, else `unknown` | Task 6.1 |
| Request body limit  | none yet: the body is read in full before validation                | SD-27    |

The cookie is Secure (and uses the `__Host-` prefix, which requires HTTPS) unless `COOKIE_SECURE`
is exactly `false`, so a missing or mistyped variable fails safe. Only a SHA-256 digest of the
256-bit random session token is stored.
