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
| 413    | `PAYLOAD_TOO_LARGE`        | The body is over 64 KiB                                            |
| 429    | `AUTH_RATE_LIMITED`        | The rate-limit hook refused the attempt (`Retry-After` is sent)    |
| 500    | `INTERNAL_ERROR`           | Anything unexpected; nothing about the cause is returned or logged |

Every response is `Cache-Control: no-store`. Logging is limited to an event name and a request id
(`server/security/log-event.ts`, filtered by `redact.ts`); request bodies, passwords, hashes,
tokens and error messages (which can embed query parameters) are never logged.

### Provisional parts

These exist so login works end to end and are to be replaced or confirmed by later tasks:

| Part                | Current stand-in                                                    | Owner    |
| ------------------- | ------------------------------------------------------------------- | -------- |
| Rate limiter        | `loginRateLimiter` allows everything                                | Task 6.1 |
| Rate-limiter client | first `X-Forwarded-For` entry if `TRUST_PROXY=true`, else `unknown` | Task 6.1 |
| CSRF protection     | none yet (a slot in `defineRoute`); relies on SameSite=Lax          | SD-27    |

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

| #   | Step             | Refusal                                                                                         |
| --- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Headers          | `413` if the declared `Content-Length` is over 64 KiB; `400` if a route with a body is not JSON |
| 2   | Session          | `401 AUTH_REQUIRED`                                                                             |
| 3   | Stage            | `403 AUTH_PASSWORD_CHANGE_REQUIRED` or `AUTH_FORBIDDEN`                                         |
| 4   | Permission       | `403 AUTH_FORBIDDEN`                                                                            |
| 5   | CSRF check       | reserved for Task 6.1, so a refused request cannot extend a session                             |
| 6   | Session activity | none: the idle timer restarts only now, for an admitted request                                 |
| 7   | Validation       | `400 VALIDATION_ERROR` for params, query and body (strict Zod schemas)                          |
| 8   | Handler          | whatever it returns, or throws                                                                  |
| 9   | Error mapping    | an `ApiError` becomes its envelope; anything else becomes a generic `500`                       |

- **Cheap checks first.** The headers are looked at before the database, so an oversized or
  mistyped request costs nothing. The body is read only after authorization, and in chunks: a
  request without a `Content-Length` (chunked upload) is cut off at 64 KiB as well.
- **Permissions are read on every request** (`resolveSession` joins `role_permissions`), so
  removing one from a role applies to the next request, without a new login. A code that is not in
  `PERMISSIONS` is never granted, even if a database row says so. A list of codes means _any of_.
- **Errors** share one envelope, `{ "error": { "code", "message" } }`, never cached, built in
  `server/http/errors.ts`: `UnauthorizedError` 401, `ForbiddenError` and
  `PasswordChangeRequiredError` 403, `ValidationError` 400, `NotFoundError` 404, `ConflictError` 409.
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
| 403    | `AUTH_FORBIDDEN`                | The role lacks the permission, or a full session calls a restricted-stage endpoint |

### Endpoints

- `GET /api/auth/me`: open to every stage. Returns `{ user, authStage, mustChangePassword,
permissions }` (`user` is the same five fields as the login response). `mustChangePassword` is the
  account flag, as in the login response; clients should decide from `authStage`, which also covers
  an expired password.
- `POST /api/auth/logout`: open to every stage, so a user who must change the password can still
  sign out. Revokes the caller's session only (other devices stay signed in), clears the cookie and
  answers `204`. Without a valid session it answers `401`, not a silent success.

### Operations for other tasks

`revokeAllForUser(db, userId, { exceptSessionId? })` ends every live session (use it on password
change, block, delete and administrator reset). `rotateSession(db, session, stage)` replaces a
session with a fresh token and a new stage in one transaction (use it when privileges change, for
example after the forced password change). Login itself revokes a token the request already carried
(session fixation).

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
  should call `revokeAllForUser` in the same transaction.
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

The settings come from `readSecuritySettings(db)`. Editing them is Task 4.5.

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
  is added and the history is cut back to five rows in the same transaction. A temporary password
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

Both endpoints still need CSRF protection (SD-27, not built yet; see the table above). A wrong
current password is not yet counted by a rate limiter: the placeholder limiter only knows login
attempts (Task 6.1, marked `TODO` in `changePassword`).
