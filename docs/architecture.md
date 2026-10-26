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
2. The per-process sliding-window limiter counts the client address (30 attempts per 15 minutes)
   and checks the address plus normalized submitted login (5 failures per 15 minutes).
3. The account is looked up by normalized login, ignoring soft-deleted accounts.
4. **Exactly one** Argon2id verification happens, against the stored hash or, for an unknown
   login, against `getDummyHash()`, so response time does not show whether the login exists.
   `getDummyHash()` is asked for on every attempt, known login or not: the first call in a process
   computes it, and that extra hash must not be paid only by unknown logins.
5. A blocked account, a wrong password, an unknown or deleted login and an expired temporary
   password all give the same result.
6. The session stage is chosen: `INITIAL_PASSWORD_CHANGE` while `must_change_password` is set,
   otherwise `PASSWORD_EXPIRED` if `password_max_age_days` is set and exceeded, otherwise
   `TOTP_CHALLENGE` when TOTP is enabled, or `FULLY_AUTHENTICATED` when no second factor is due.
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
| 400    | `VALIDATION_ERROR`         | Invalid JSON, wrong type, or a missing/extra/oversized field       |
| 401    | `AUTH_INVALID_CREDENTIALS` | Every credential failure; byte-identical body and headers          |
| 413    | `PAYLOAD_TOO_LARGE`        | The body is over 16,384 bytes                                      |
| 415    | `UNSUPPORTED_MEDIA_TYPE`   | The media type is not `application/json`                           |
| 429    | `RATE_LIMITED`             | A login window is exhausted (`Retry-After` is sent)                |
| 500    | `INTERNAL_ERROR`           | Anything unexpected; nothing about the cause is returned or logged |

Every response is `Cache-Control: no-store`. Logging is limited to an event name and a request id
(`server/security/log-event.ts`, filtered by `redact.ts`); request bodies, passwords, hashes,
tokens and error messages (which can embed query parameters) are never logged.

### Login throttling

`server/security/login-rate-limiter.ts` uses two sliding windows. The address-wide window admits
30 attempts in 15 minutes. The address-plus-normalized-login window admits five failed attempts;
the sixth is refused even when the submitted login does not name an account. It is checked before
the account lookup and records the submitted string for every credential failure, so the status,
body and `Retry-After` do not disclose account existence. A successful login does not consume the
failure window. Separating the second key by address prevents one remote address from locking a
victim out everywhere.

The first `X-Forwarded-For` value is trusted only when `TRUST_PROXY=true`; otherwise a
client-supplied forwarding header is ignored. The store is an in-memory `Map`, so it is
**per-process and lost on restart**. A horizontally scaled or restart-resilient deployment must
replace it with a shared, atomic store such as Redis.

## CSRF protection

SameSite is defence in depth, not the CSRF protocol. On login and every session rotation the
server sets `XSRF-TOKEN = base64url(HMAC-SHA256(CSRF_SECRET, session.id))`, with `Secure`,
`SameSite=Lax` and `Path=/`. It is deliberately not HttpOnly: Angular reads it and sends the value
as `X-XSRF-TOKEN`. The session cookie remains HttpOnly and is never exposed to Angular.

For every `POST`, `PUT`, `PATCH` and `DELETE`, `defineRoute` requires `Origin` (or the `Referer`
origin as a fallback) to equal `APP_ORIGIN`. An authenticated request must also carry the correct
session-bound XSRF header; comparison uses `crypto.timingSafeEqual`. These checks run after
authentication and authorization but before session activity is recorded or a handler runs. The
public login route has no session-bound token yet, so it requires the same-origin check and a JSON
media type; a cross-origin simple HTML form cannot drive it.

## Sessions

Opaque, server-side and revocable. A session is a row in `sessions`; the browser only holds a
random token that points at it. Code: `server/auth/session-service.ts` (rules),
`server/auth/cookie.ts` (cookie), `server/auth/guards.ts` (what a route calls).

### Token and cookie

The token is 32 bytes from `crypto.randomBytes`, base64url, always 43 characters. Only its SHA-256
digest is stored (`sessions.token_hash`), so a copy of the database cannot be replayed as a cookie
and the token never appears in the database file, its write-ahead log, a log line or a response
body. It travels only in the cookie:

| Attribute | Value                                                                                |
| --------- | ------------------------------------------------------------------------------------ |
| Name      | `__Host-sd_session` over HTTPS, `sd_session` when `COOKIE_SECURE=false` (dev only)   |
| HttpOnly  | always: page scripts cannot read it                                                  |
| Secure    | unless `COOKIE_SECURE` is exactly `false`, so a missing or mistyped value fails safe |
| SameSite  | `Lax`                                                                                |
| Path      | `/`; no `Domain`, so it is host-only                                                 |
| Expires   | the session's absolute end; logout sends `Max-Age=0`                                 |

The `__Host-` prefix makes browsers insist on Secure, `Path=/` and no `Domain`, and prevents a
sibling subdomain from planting a cookie of that name. Over HTTPS the plain name is therefore
ignored. The Angular app never sees the token and must not copy it anywhere:
`tests/no-token-in-browser-storage.test.ts` fails if the frontend source uses `localStorage`,
`sessionStorage`, `indexedDB` or `document.cookie`.

### Lifetime

| Rule     | Value                                                                                |
| -------- | ------------------------------------------------------------------------------------ |
| Absolute | 12 hours from login however active the session is (`SESSION_ABSOLUTE_LIFETIME_MS`)   |
| Idle     | `security_settings.session_idle_timeout_minutes` (default 15), read on every request |

Both limits are inclusive: a session is dead from exactly 12 hours, or exactly the idle timeout,
after the reference time. The idle timeout is read from the database on every request, so an
administrator's change applies to sessions that are already open. A session found expired, or
belonging to a blocked or deleted user, is **revoked on the spot**, so it cannot come back to life
when the user is unblocked or the timeout is raised.

Inactivity runs from the last request that was **admitted**: authenticated, in an allowed stage and
holding any required permission. A refused request never extends a session, so an old cookie
cannot be kept alive by hammering an endpoint it may not use. Every admitted request counts,
including `GET /api/auth/me`: the Angular app calls it once at start-up and must not poll it.

### Route wrapper

Every API route is built with `defineRoute` (`server/http/route-handler.ts`), which does the
checks in one place so a handler cannot forget one. `auth` is required: a route that does not say who
may call it does not compile, and a route open to everyone must say `auth: 'public'`.

```ts
export const GET = defineRoute({
  name: 'users.list', // the event prefix in logs
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  query: ListUsersQuery, // optional; `body` and `params` work the same way
  handler: ({ session, query }) => NextResponse.json(/* ... */),
});
```

A request stops at the first step that refuses it:

| #   | Step             | Refusal                                                                       |
| --- | ---------------- | ----------------------------------------------------------------------------- |
| 1   | Headers          | `413` above 16,384 bytes; `415` if a route with a body is not JSON            |
| 2   | Session          | `401 AUTH_REQUIRED`                                                           |
| 3   | Stage            | `403 AUTH_PASSWORD_CHANGE_REQUIRED`, `AUTH_TOTP_REQUIRED` or `AUTH_FORBIDDEN` |
| 4   | Permission       | `403 AUTH_FORBIDDEN`                                                          |
| 5   | CSRF check       | `403 CSRF_ORIGIN_MISMATCH` or `CSRF_TOKEN_INVALID`                            |
| 6   | Session activity | none: the idle timer restarts only now, for an admitted request               |
| 7   | Validation       | `400 VALIDATION_ERROR` for params, query and body (strict Zod schemas)        |
| 8   | Handler          | whatever it returns, or throws                                                |
| 9   | Error mapping    | an `ApiError` becomes its envelope; anything else becomes a generic `500`     |

- **Cheap checks first.** The headers are looked at before the database, so an oversized or
  mistyped request costs nothing. The body is read only after authorization, and in chunks: a
  request without a `Content-Length` (chunked upload) is cut off at 16,384 bytes as well.
- **Permissions are read on every request** (`resolveSession` joins `role_permissions`), so
  removing one from a role applies to the next request, without a new login. A code that is not in
  `PERMISSIONS` is never granted, even if a database row says so. A list of codes means _any of_.
- **Errors** share one envelope, `{ "error": { "code", "message" } }`, never cached, built in
  `server/http/errors.ts`: `UnauthorizedError` 401, `ForbiddenError` and
  `PasswordChangeRequiredError` 403, `ValidationError` 400, `NotFoundError` 404, `ConflictError` 409.
  Domain refusals use an `ApiError` with their own code, such as `409 LOGIN_ALREADY_EXISTS` and
  `409 PROTECTED_ACCOUNT` (see [User administration](#user-administration)).
  An unexpected error (a SQL failure included) is logged as an event name and a request id only,
  and answered with `500 INTERNAL_ERROR`: no stack, query or path leaves the server.
- **A guardrail, not a convention.** `tests/route-guard-conformance.test.ts` imports every
  `app/api/**/route.ts` and fails when an exported method was not built with `defineRoute`, when an
  `/api/admin/**` route names no permission, or when a route is `public` but is not on the allowlist
  (`/api/health`, `/api/auth/login`). `tests/admin-routes-authz.test.ts` then proves 401 for an
  anonymous caller and 403 for a Manager, Employee and Guest on every `/api/admin/**` route.

The wrapper calls `requireStage` (`server/auth/guards.ts`), which returns the session, the user and
the role's permissions. Its refusals:

| Status | `error.code`                    | When                                                                               |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------- |
| 401    | `AUTH_REQUIRED`                 | No cookie, malformed, unknown, revoked or expired: one byte-identical body         |
| 403    | `AUTH_PASSWORD_CHANGE_REQUIRED` | A session that still owes a password change calls anything not open to it          |
| 403    | `AUTH_TOTP_REQUIRED`            | The password succeeded, but the TOTP challenge is not complete                     |
| 403    | `AUTH_FORBIDDEN`                | The role lacks the permission, or a full session calls a restricted-stage endpoint |

### Endpoints

- `GET /api/auth/me`: open to every stage. Returns `{ user, authStage, mustChangePassword,
permissions, passwordPolicy, totpEnabled }` (`user` is the same five fields as the login response).
  `mustChangePassword` is the account flag, as in the login response; clients should decide from
  `authStage`, which also covers an expired password. `passwordPolicy` is `{ minPasswordLength,
rejectPersonalDataInPassword }`, the current values from the security settings, read on every call.
  A session that still has to change its password gets it too, because the screen that forces the
  change needs the hint and the session can reach no other endpoint. The other two settings (password
  expiry, idle timeout) are not part of it.
- `POST /api/auth/logout`: open to every stage, so a user who must change the password can still
  sign out. Revokes the caller's session only (other devices stay signed in), clears the cookie and
  answers `204`. Without a valid session it answers `401`, not a silent success.

### Operations for other tasks

`revokeAllForUser(db, userId, { exceptSessionId? })` ends every live session (use it on password
change, block, delete and administrator reset). `rotateSession(db, session, stage)` replaces a
session with a fresh token and a new stage in one transaction (use it when privileges change, for
example after the forced password change). Login itself revokes a token the request already carried
(session fixation).

## Optional TOTP two-factor authentication

TOTP is an extra-credit layer implemented with `otplib` 13.x; the application does not implement
RFC 6238 itself. Enrollment generates a random Base32 secret and returns its `otpauth://` URI only
from `POST /api/auth/totp/enroll`. Angular renders that URI as a QR code with `qrcode`, clears the
QR and confirmation form on cancel, success and component destruction, and never puts the URI in a
URL, router state, storage or a log.

The database stores only an AES-256-GCM envelope in `users.totp_secret_encrypted`: version, random
96-bit IV, authentication tag and ciphertext in base64url. `TOTP_ENCRYPTION_KEY` is an independent
32-byte base64 environment secret. A missing or wrong-length key fails closed; tampering makes GCM
authentication fail. The plaintext secret is decrypted only for verification and is never included
in logs or responses after the enrollment response.

Enrollment is enabled only after a valid six-digit confirmation. Login with a correct password for
an enabled account creates a restricted `TOTP_CHALLENGE` session, not a full session. That stage may
call only `/api/auth/me`, logout and `POST /api/auth/totp/challenge`; every other protected route
returns `403 AUTH_TOTP_REQUIRED`. A valid code rotates the session to `FULLY_AUTHENTICATED`.
Password changes also return to the challenge stage when TOTP is enabled, so rotating the password
cannot bypass the second factor.

Verification accepts the current 30-second step with at most one step of clock drift. The matched
step is stored in `totp_last_used_step`, and `otplib` receives it as an exclusive lower bound;
therefore an accepted code cannot be replayed even while its time window is still open. Five failed
codes per restricted session are allowed in 15 minutes; the sixth receives `429`. This limiter is
process-local, with the same scaling limitation as login throttling.

Disabling TOTP requires both the current password and a fresh code. Administrator recovery uses the
separate `users:reset-totp` permission, clears the encrypted secret and revokes every session of the
target. The operator must complete an out-of-band proof-of-identity procedure described in the
threat model before using it; possession of an administrator session alone is not treated as proof
that the requester owns the target account.

## User administration

`app/api/admin/users/**`, Administrator only. Every endpoint is `FULLY_AUTHENTICATED` plus one
permission, so a Manager, Employee or Guest gets `403` and an anonymous caller `401`.

| Endpoint                                    | Permission             | Answer                                                                               |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/admin/users`                      | `users:read`           | `200 { items, page, pageSize, total }`                                               |
| `POST /api/admin/users`                     | `users:create`         | `201 { user, temporaryPassword: { value, expiresAt } }`                              |
| `GET /api/admin/users/[id]`                 | `users:read`           | `200` the account (`404` if missing or soft-deleted)                                 |
| `PATCH /api/admin/users/[id]`               | `users:update`         | `200` the updated account                                                            |
| `DELETE /api/admin/users/[id]`              | `users:delete`         | `204`, also when it was already deleted                                              |
| `POST /api/admin/users/[id]/block`          | `users:block`          | `200` the account, also when it was already blocked                                  |
| `POST /api/admin/users/[id]/unblock`        | `users:block`          | `200` the account, also when it was not blocked                                      |
| `POST /api/admin/users/[id]/reset-password` | `users:reset-password` | `200 { temporaryPassword: { value, expiresAt } }` (`404` if missing or soft-deleted) |
| `POST /api/admin/users/[id]/reset-totp`     | `users:reset-totp`     | `204`; clears TOTP and revokes the target's sessions after identity verification     |

- **Strict allowlists both ways.** Responses are built by `toAdminUserDto` from named columns
  (the query never loads `password_hash`); request bodies and queries are strict Zod schemas
  (`server/users/schemas.ts`), so naming `passwordHash`, `isBlocked`, `login`, `role_id` or any
  other key is a `400`, never silently ignored. The role is written as the upper-case role id
  (`EMPLOYEE`); `ADMINISTRATOR` cannot be assigned through the API.
- **List.** Query: `q` (login, first name, last name; at most 64 characters), `role`, `status`,
  `page` (from 1) and `pageSize` (default 20, at most 100; a larger value is refused, not
  clamped). Ordered by login. `%`, `_` and `\` in `q` are escaped (`LIKE ... ESCAPE '\'`), so they
  match themselves. SQLite's `LIKE` ignores case for ASCII letters only: the login is compared in
  its normalized form (`normalizeLogin`), but a name containing, say, `Ł` is matched by `Ł`, not `ł`.
  Soft-deleted accounts are in no list, count or lookup.
- **Status.** `blocked` is `is_blocked`; `pending` is not blocked and still owes the first password
  change (`must_change_password`); `active` is neither. The three partition the live accounts: an
  account that is blocked _and_ pending counts as `blocked`. The UI adds an "expired temporary
  password" hint when `temporaryPasswordExpiresAt` is in the past.
- **Create.** The temporary password is issued and hashed first (hashing is asynchronous, a
  better-sqlite3 transaction is not) and the row is then written by one `INSERT`, atomic by
  itself: there is never an account without its credential. A login that exists in any spelling is
  `409 LOGIN_ALREADY_EXISTS`. The plaintext appears only in the `201` response (`no-store`).
- **Block, unblock, delete** (`server/users/account-service.ts`) each run in one transaction and
  call `revokeAllForUser`, so a blocked or deleted account loses every session at once. Repeating
  any of them succeeds. A repeated delete keeps the time of the first one. Unblocking restores
  login eligibility only: revoked sessions stay revoked and the password state is untouched, so an
  account reset while blocked stays blocked until it is unblocked explicitly. A soft-deleted
  account keeps its row and its reserved login, so tickets, history and sessions stay valid.
- **Reset password** (`resetPassword` in `server/users/account-service.ts`). The body is the empty
  JSON object `{}`: the schema is strict, so a password in the body is a `400`, and a bodyless or
  form post is a `400` too (the route requires `application/json`), which also keeps a plain
  cross-site form from triggering it until SD-27. The temporary credential is issued and hashed
  first, as in create, so its 12 hours count from the call. One `BEGIN IMMEDIATE` transaction then
  loads the account (`404` if missing or soft-deleted), files the hash being replaced in the
  password history when it is a regular password (`must_change_password = 0`; a temporary
  password is never filed) through `rememberPasswordHash`, the helper `changePassword` uses too,
  applies the credential and revokes every session of the account: all of it or none of it.
  `is_blocked` and `deleted_at` are not touched, so resetting a blocked account does not unblock
  it. The answer is `no-store`; the plaintext is in that body only, never in a log or a table.
  Afterwards the user's old password no longer signs in, the previous regular password cannot be
  chosen again, and the temporary one must be replaced through `change-initial-password`.
- **Resetting the permanent `ADMIN` account is allowed**, like any other (a decision, not an
  oversight; the alternative was `409 PROTECTED_ACCOUNT`). Only ADMIN can do it, so it ends ADMIN's
  own session, and the new password lapses after 12 hours like every reset password. Two
  consequences follow. **Lockout:** the password is shown once; if it is lost, or lapses unused,
  no other account can reset ADMIN, and there is no in-app recovery (a development database is
  rebuilt with `db:reset:dev`, as in [database-schema.md](database-schema.md#admin-does-not-lapse-after-12-hours)).
  **Takeover:** a stolen ADMIN session can reset the password and then, because the forced change
  asks for no current password, choose a new one, without ever knowing the old one; every other
  session is revoked in the process. The confirmation dialog warns about the first.
- **The permanent `ADMIN` account** (`login_normalized = 'admin'`) cannot be blocked, deleted or
  given another role, and nobody else can be given the Administrator role: `409
PROTECTED_ACCOUNT` (`assertNotProtectedAccount`). The service checks first so the client gets a
  proper error; the triggers in migration `0001` refuse the same changes if a bug ever gets past it.
- **Screens** (`apps/frontend/.../features/admin-users`, typed client `core/http/admin-api.service.ts`):
  the list at `/admin/users`, the account at `/admin/users/:id` (edit, reset password, block,
  unblock, delete) and `/admin/users/new`. Which buttons appear follows `AuthService.has()` and the
  Block and Delete buttons are disabled for the `ADMIN` login with the reason as a tooltip; both
  are only a convenience, the server answers every call (`403`, `404`, `409` are shown as
  messages). Reset password stays available for `ADMIN`. Reset, block, unblock and delete ask first
  through `ConfirmDialogComponent` and state the consequence (a blocked account is told it stays
  blocked, `ADMIN` that nobody else can reset it). The temporary password, after a create or a
  reset, goes straight to `TemporaryPasswordDialogComponent`: it is shown once, Escape does not
  close it, it is removed from the page when closed, and it is never stored, logged, put in the
  URL or in router state. After a reset the page shows the account as awaiting its first password
  change with the new deadline (patched locally from the answer: `Last changed` is not refreshed
  until the page is loaded again).
  These components use `@Input`, `@Output` and `@ViewChild`, not `input()`, `output()` and
  `viewChild()`: the root Vitest run that gates coverage has no Angular compiler plugin, and
  without it the initializer functions are not recognized.
- **Cross-site requests.** Every state-changing administrator route passes through the shared
  origin and session-bound XSRF checks before any mutation or activity update.

## Temporary passwords (variant 2)

`server/auth/temporary-password.ts`. Account creation, administrator reset and the seed all issue
credentials through it.

- **Shape.** Exactly 16 characters from letters, digits and `!@#$%^&*()-_=+[]{}?`, with at least
  one of each group: one guaranteed character per group, the rest from the combined pool, then a
  Fisher-Yates shuffle, everything via `crypto.randomInt` (a CSPRNG, free of modulo bias). The
  guaranteed characters therefore do not sit at fixed positions.
- **Lifetime.** Valid for exactly 12 hours from issue: usable at +11 h 59 min 59.999 s, expired from
  exactly +12 h (`isTemporaryPasswordExpired`). The time is read before hashing, so slow hashing can
  only shorten the window.
- **One time, never stored.** `issueTemporaryCredential(clock)` returns `{ plaintext, hash,
expiresAt }`. The plaintext is shown once to the administrator in a `Cache-Control: no-store`
  response and never logged, stored, put in a URL or sent to analytics; only the Argon2id hash is
  kept, so another administrator cannot read it back later.
- **Applying it.** `applyTemporaryCredential(tx, userId, credential)` sets `password_hash`,
  `must_change_password = 1`, `temporary_password_expires_at` and `updated_at`, and throws if the
  user does not exist. It does not end the user's sessions: a caller resetting an existing account
  should call `revokeAllForUser` in the same transaction, as `resetPassword` does.
- **Randomness is enforced.** ESLint bans `Math.random` under `apps/backend/src/server/**`;
  `tests/eslint-no-math-random.test.ts` fails if that rule is removed or narrowed.
- **Testing time.** `tests/helpers/fake-clock.ts` provides a `FakeClock` that tests install
  (`setClockForTests`) and move with `advance()` / `set()`, so expiry boundaries are exact.

## Password policy (variant 2)

`server/auth/password-policy.ts`: `validateNewPassword(password, user, settings)` is the one pure
function (no I/O) that decides whether a password a user chose is acceptable. Every flow that sets
one goes through it on the server (`password-service.ts`), so a client that skips the Angular
validation is refused all the same. It returns the list of violated rules, in a fixed order; an
empty list means acceptable.

| Violation                                                       | Rule                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `TOO_SHORT`                                                     | fewer than `max(12, security_settings.min_password_length)` characters                            |
| `TOO_LONG`                                                      | more than 128 characters                                                                          |
| `CONTAINS_LOGIN` / `CONTAINS_FIRST_NAME` / `CONTAINS_LAST_NAME` | only when `reject_personal_data_in_password` is on: the password contains that value, in any case |
| `COMMON_PASSWORD`                                               | the password is one of the entries in `banned-passwords.ts`                                       |

- **Length counts Unicode code points** (`Array.from(password).length`), not UTF-16 units or
  grapheme clusters: 12 emoji are 12 characters. The upper bound is 128 code points, which is at
  most 512 bytes in UTF-8, so one request cannot make the server hash an arbitrarily long input
  and the hasher's 1024-byte limit is never reached. Spaces and any Unicode character are allowed;
  the password is never trimmed.
- **Comparison form.** Personal-data and banned-list checks compare `s.normalize('NFKC').toLowerCase()`
  of both sides, so full-width letters and composed/decomposed accents match and letter case does
  not matter. **Diacritics are not stripped**: the first name `Zoe` is not found inside `Zoë`. With
  the first name `Anna`, `MyANNApassword2026!` is rejected. A profile value that is empty (or only
  whitespace) is skipped, otherwise every password would match it.
- **No composition rules.** There is no upper/lower-case, digit or symbol requirement for
  user-chosen passwords (NIST SP 800-63B advises against them). The 16-character mix of letters,
  digits and specials belongs to the temporary-password generator only.
- **Banned list.** `banned-passwords.ts` holds a few dozen very common passwords of at least 12
  characters, matched as a whole (not as a substring) after the same normalization. It is local:
  no breach-database API is called.
- **API mapping.** A violation becomes `400 PASSWORD_POLICY_VIOLATION` with
  `error.details.violations` listing the codes above. The message is one generic text for every
  violation and never contains profile data; the client turns the codes into specific wording.

The settings come from `readSecuritySettings(db)`. Editing them is described under
[Security settings](#security-settings).

## Changing passwords

Two endpoints replace a password; both live in `server/auth/password-service.ts`.

| Endpoint                                 | Admits (`requireStage`)                   | Body                                                   |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `POST /api/auth/change-initial-password` | `INITIAL_PASSWORD_CHANGE` only            | `{ newPassword, confirmNewPassword }`                  |
| `POST /api/auth/change-password`         | `FULLY_AUTHENTICATED`, `PASSWORD_EXPIRED` | `{ currentPassword, newPassword, confirmNewPassword }` |

The body is strict JSON (`application/json` only) and is read only after the session is admitted.
Success is `200 { user, authStage: "FULLY_AUTHENTICATED" }` with a **new** session cookie.

**The restriction is in the session, not in Angular routing.** A session in `INITIAL_PASSWORD_CHANGE`
or `PASSWORD_EXPIRED` is refused by every endpoint whose guard does not list its stage, with `403
AUTH_PASSWORD_CHANGE_REQUIRED`. Business endpoints list only `FULLY_AUTHENTICATED`; only `GET
/api/auth/me`, `POST /api/auth/logout`, the endpoint of that stage (and, for an expired password,
`change-password`) admit a restricted session. Because `defineRoute` makes the `auth.stages` list
mandatory, a route cannot skip this check by accident.

- **One transaction, `BEGIN IMMEDIATE`.** The new hash (made before the transaction, because hashing
  is asynchronous and a transaction is synchronous), the history update, the revocation of all of the
  user's sessions and the new session succeed or fail together.
- **Concurrent requests.** The `UPDATE` is guarded by the hash that was checked (and, for the initial
  change, by `must_change_password = 1`); when it matches no row, the request gets `409
PASSWORD_CHANGE_ALREADY_COMPLETED` and nothing is written. Two simultaneous requests with the
  same session therefore produce exactly one `200` and one `409`.
- **History.** `password_history` holds hashes of earlier _regular_ passwords. `assertNotReused`
  verifies a candidate against the current hash and the five newest entries (`ORDER BY created_at DESC,
id DESC LIMIT 5`; salts differ, so hashes cannot be compared). On an ordinary change the old hash
  is added and the history is cut back to five rows in the same transaction
  (`rememberPasswordHash`, which the administrator reset uses as well). A temporary password
  is never recorded, and it is refused as a new password because it is the current hash.
- **Temporary-password deadline.** `changeInitialPassword` checks the 12-hour expiry again (a NULL
  expiry means no deadline); an expired one revokes the session and answers `401
AUTH_TEMPORARY_PASSWORD_EXPIRED`.

| Status | `error.code`                        | When                                                                                                               |
| ------ | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 400    | `VALIDATION_ERROR`                  | Wrong shape; or the two new passwords differ (`details.fieldErrors.confirmNewPassword` = `PASSWORDS_DO_NOT_MATCH`) |
| 400    | `CURRENT_PASSWORD_INCORRECT`        | `change-password` only; refused before anything is written                                                         |
| 400    | `PASSWORD_POLICY_VIOLATION`         | see [Password policy](#password-policy-variant-2)                                                                  |
| 400    | `PASSWORD_REUSED`                   | equal to the current password or one of the five previous regular ones                                             |
| 401    | `AUTH_TEMPORARY_PASSWORD_EXPIRED`   | `change-initial-password` after the 12-hour deadline; the session is revoked                                       |
| 409    | `PASSWORD_CHANGE_ALREADY_COMPLETED` | the credential changed while the request was running                                                               |

Both endpoints pass through the shared origin and session-bound XSRF checks. Login throttling is
separate from current-password validation: password policy, history and the old credential remain
authoritative server-side checks inside the password-change transaction.

## Security settings

`app/api/admin/security-settings/route.ts`, Administrator only: `FULLY_AUTHENTICATED` plus one
permission, so a Manager, Employee or Guest gets `403` and an anonymous caller `401`.

| Endpoint                             | Permission                 | Answer                                 |
| ------------------------------------ | -------------------------- | -------------------------------------- |
| `GET /api/admin/security-settings`   | `security-settings:read`   | `200` the four settings                |
| `PATCH /api/admin/security-settings` | `security-settings:update` | `200` all four settings, as now stored |

| Setting                        | Allowed values                         | Default |
| ------------------------------ | -------------------------------------- | ------- |
| `minPasswordLength`            | whole number, 12 to 128                | 12      |
| `rejectPersonalDataInPassword` | `true` or `false`                      | `false` |
| `passwordMaxAgeDays`           | whole number, 1 to 3650, or `null`: no | `null`  |
| `sessionIdleTimeoutMinutes`    | whole number, 1 to 1440                | 15      |

- **PATCH takes any non-empty subset** (`SecuritySettingsPatch`, `server/security/schemas.ts`). An
  unknown key (including `updatedBy` or `id`), an empty body, a wrong type or an out-of-range value
  is a `400`, and nothing is written. The `400` is the pipeline's generic `VALIDATION_ERROR`: it
  names no field, by design. The floor of 12 is held twice: by Zod and by `CHECK
(min_password_length >= 12)`, so a bug above the service still cannot weaken the password rule.
- **Nothing is cached.** `getSecuritySettings` is `readSecuritySettings`, the very function the
  session, login and password services call whenever they enforce a setting, so the value shown is
  by construction the value in force, and a change is visible to the next request.
- **One write.** `updateSecuritySettings` is a single upsert in one `BEGIN IMMEDIATE` transaction:
  only the named columns change, and a database without the row (which reads as the defaults) gets
  it created. The table stamps `updated_at` on insert and on every update, and `updated_by` is the
  administrator who made the change. Only the latest change is kept, not a history of changes.
- **Persisted.** The values are rows in the database file, so a restart of the backend returns what
  was saved (`settings-service.test.ts` closes a file database and reopens it).

When a change takes effect differs by setting; this is what the tests (SEC-23) pin down.

| Setting                                             | Takes effect                                     | How                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessionIdleTimeoutMinutes`                         | the next request of every session, open ones too | `resolveSession` reads it on every request. A session already idle for longer than the new limit is revoked at that request, and raising the limit later does not bring it back.                                                             |
| `passwordMaxAgeDays`                                | the next sign-in                                 | `authStageFor` compares the age of the password with the limit at login: older than the limit (strictly: exactly that many days is still valid) gives a `PASSWORD_EXPIRED` session; `null` turns expiry off. Open sessions keep their stage. |
| `minPasswordLength`, `rejectPersonalDataInPassword` | the next password change                         | `assertPasswordPolicy` runs when a password is set (the forced first change included). Existing passwords are not re-checked.                                                                                                                |

A limit above 720 minutes for the idle timeout changes nothing in practice: the absolute 12-hour
session lifetime ends the session first.

- **Screen** (`features/admin-security/security-settings.component.ts`, routed at
  `/admin/security`): a reactive form with a switch for the personal-data rule, number inputs, and
  a "Disabled" checkbox for the maximum age (it sends `null` and switches the field off). Each
  field says when its setting takes effect. The limits are checked in the browser as a
  convenience, mirroring the server's, and Save sends all four values and then shows what the
  server stored. The server's `400` carries no field, so it is shown as one message for the whole
  form, not under a field. Someone who may read the settings but not update them sees the form
  disabled and no Save button.
- **CSRF.** `PATCH` uses the same origin and session-bound XSRF checks as every other
  state-changing route.

## HTTP response hardening and deployment

Next.js applies these headers to every `/api/**` response: `Cache-Control: no-store`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`,
`Cross-Origin-Resource-Policy: same-origin`, and
`Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`. The API emits no CORS
headers, so a foreign-origin preflight is never granted.

The separately served SPA should use a nonce- or hash-based policy tailored to its production
assets, starting from `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors
'none'`, then adding only the exact script, style, font and connection sources it needs. Do not add
`unsafe-eval`; avoid `unsafe-inline` by using nonces or hashes. At the HTTPS reverse proxy, send
`Strict-Transport-Security: max-age=31536000; includeSubDomains` only after every covered subdomain
is permanently HTTPS; add `preload` only after satisfying the browser preload requirements.
