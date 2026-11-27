# SecureDesk — Module 2 Implementation Backlog

**Course:** Cybersecurity
**Assignment:** Module 2 — Protection against bots, automated traffic and data leakage ("Zabezpieczenia przed botami, ruchem automatycznym i wyciekiem danych")
**Individual variant:** No. 2 ("Odwrócony ciąg", own CAPTCHA mechanism), applied in every module — confirmed by the student (decision D-01)
**Application:** SecureDesk — the helpdesk application delivered in Module 1 (Angular + Next.js API + SQLite)
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-02, updated with the student's confirmations (variant 2 applied, Turnstile accepted, AWS keys chosen)
**Language:** English (API error messages stay Polish and UI texts stay English, exactly as in the Module 1 code)

---

## 0. How to use this document

This backlog extends the Module 1 backlog (`docs/course/backlog.md`, items SD-01 to SD-32, all implemented). It continues the numbering: **SD-33 to SD-64**, epics **7 to 12**, task IDs **Task 7.1 to Task 12.4**, so GitHub milestones and issues of both modules can live in one repository without colliding. Every item has an objective, an implementation checklist, acceptance criteria, dependencies and a size.

It was written against the repository as it is now (login service, rate limiter, settings, docs and tests were read), not against the abstract Module 1 plan, so file paths and "what changes" statements refer to real code.

### Requirement provenance

| Tag            | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `[ASSIGNMENT]` | Explicitly required by the Module 2 PDF ("Moduł 2 – Zabezpieczenia przed atakami.pdf"), section 2 or 5            |
| `[EXTRA]`      | The PDF's "zadanie dodatkowe (na ocenę bardzo dobrą)": per-IP login limit                                         |
| `[VARIANT]`    | The individual CAPTCHA variant of section 3 of the PDF (variant 2, reversed string), applied to the login CAPTCHA |
| `[DESIGN]`     | Project decision to make the feature cohesive, demonstrable and extensible. Not a course requirement              |
| `[HARDENING]`  | Security measure beyond the PDF's explicit list that a sound implementation needs                                 |
| `[OPTIONAL]`   | May be postponed without affecting the mandatory scope                                                            |

### Priorities

| Priority         | Meaning                                                            | Completion expectation                       |
| ---------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| P0 — Required    | Mandatory assignment functionality or indispensable foundation     | Must be implemented for Module 2 completion  |
| P1 — Recommended | Graded extra, hardening or demonstrator that supports the P0 story | Implement after or alongside related P0 work |
| P2 — Optional    | Nice to have, or a literal-compliance alternative                  | Only when P0 and P1 are done                 |

Note on the extra task: the PDF marks the per-IP limit as extra credit. By the Module 1 convention that would be P2, but it is small, shares all infrastructure with the account lockout and is the answer to password spraying, so it is **P1** here and should be built right after the P0 lockout.

Size scale (same as the generated GitHub issues): **S** up to 1 person-day, **M** 1–2, **L** 3–5, **XL** more than 5.

---

## 1. Original assignment: authoritative requirements

### 1.1 What the PDF asks for

Theory covered: brute force, credential stuffing, password spraying; layered defence (attempt limit with temporary lock, CAPTCHA, hidden trap fields); CAPTCHA costs and limits (AI and solving services, accessibility); reCAPTCHA now managed in Google Cloud (free tier 10,000 verifications per month) with Cloudflare Turnstile and hCaptcha as alternatives; honeytokens and the Canarytokens service.

| Ref. | PDF task                                                                                                                                                                         | Implementation consequence                                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| B-01 | **Failed-login limit.** The administrator sets the number of attempts after which the account is blocked for 15 minutes; the login screen shows the remaining block time         | Persistent attempt tracker, admin setting, `429` with remaining seconds, countdown in Angular |
| B-02 | **CAPTCHA at login.** A ready solution (reCAPTCHA / Turnstile / hCaptcha) or the own mechanism of the individual variant; every challenge is one-time and has a limited validity | Provider abstraction, server-side verification, single-use and maximum-age rules              |
| B-03 | **reCAPTCHA at password change.** Google reCAPTCHA (or Turnstile / hCaptcha) with token verification; a form without a valid token is rejected                                   | Server-side token verification on both password-change endpoints                              |
| B-04 | **Bot trap.** A hidden field in the login form; filling it means a bot                                                                                                           | Honeypot field, server-side check, silent handling                                            |
| B-05 | **Canarytokens.** At least two tokens of different types, including a trap account whose use triggers an alert. Second token to choose: document, AWS keys, DNS, database dump   | Honeytoken registry, account trap, decoy resource with a second token type, alert path        |
| B-06 | **Test.** A script simulating a bot that tries to log in to the own application, plus a summary of which protections worked                                                      | `scripts/bot-sim` with a per-scenario protection matrix                                       |
| B-07 | **Extra (very good grade).** Limit login attempts from one IP address regardless of login (password spraying)                                                                    | Per-IP counters and block                                                                     |

Testing is allowed **only on the own application**. Attacking someone else's system without the owner's consent may be a crime. The bot script must enforce this (SD-61).

### 1.2 Individual variant (section 3 of the PDF)

The variant concerns the CAPTCHA at login. A student who deploys a ready solution may skip it; this project applies the variant anyway, because the student confirmed that variant No. 2 is applied in every module. Variant 2 of the table is **"Odwrócony ciąg"**: a random character string that the user retypes in reverse order. The login uses it; the password change uses Cloudflare Turnstile, because the PDF requires a ready-provider token check there.

### 1.3 Control questions (answers go into the report)

1. Why does a production system not implement bot protection (CAPTCHA, limits, risk scoring) itself but use ready solutions? What are the drawbacks of relying on an external provider?
2. How does credential stuffing differ from password spraying?
3. What threat does blocking an account after N failed attempts bring?
4. Why does a honeytoken give alarms with practically no false positives?

### 1.4 Required reporting deliverable

A PDF report with: title page (name, group, index number, module, course); theoretical introduction in own words; completed exercises (variant number if applicable, how CAPTCHA and the attempt limit work, how reCAPTCHA is verified, the deployed tokens, key code excerpts); screenshots (account lock, CAPTCHA at login, reCAPTCHA at password change, rejected request without a token, received Canarytokens alerts, bot script result); answers to the four questions; conclusions; a repository link or code archive.

---

## 2. Scope and relation to Module 1

### 2.1 In scope for Module 2

- Persistent failed-login tracking, administrator-configurable lockout (N attempts → 15 minutes), countdown on the login screen.
- CAPTCHA at login (own variant 2, reversed string) and at password change (Cloudflare Turnstile), both verified on the server with single-use and maximum-age rules.
- One CAPTCHA provider interface; the server picks the provider per form, and either provider can be switched to either form by configuration.
- Honeypot field in the login form.
- Honeytokens: trap account and a decoy resource carrying a second Canarytoken type; alert path (Canarytokens e-mail plus an in-app critical event).
- Security event collection and a minimal administrator view, because alerts need somewhere to land. Module 1's backlog named "security event collection" as a Module 2 candidate.
- Per-IP login throttling and password-spraying detection (extra task).
- Bot simulation script, unit/integration/E2E tests, evidence and the Module 2 report.

### 2.2 Out of scope

- A full SIEM, e-mail-based notification infrastructure of our own (optional channel only), geo-IP or reputation feeds, machine-learning risk scoring.
- Self-registration, password reset by e-mail, device fingerprinting.
- Making our own CAPTCHA strong against OCR or AI. It is a coursework variant; the report states this honestly.
- Requirements of Module 3: they have not been provided and must not be invented.

### 2.3 What already exists and how Module 2 changes it

| Existing artifact                                                  | Today                                                                                                             | Change in Module 2                                                                                                                                                       |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `server/auth/login-service.ts` `authenticate()`                    | Calls `loginRateLimiter.check()` first, one Argon2id verification per attempt (dummy hash for unknown logins)     | Wrapped by the login defence pipeline (SD-37); the one-verification invariant stays                                                                                      |
| `server/security/login-rate-limiter.ts`                            | In-memory: 30 attempts / 15 min per IP, 5 failures / 15 min per IP + login; lost on restart                       | Retired for login (replaced by SQLite-backed tracking, SD-38 and SD-40). `SlidingWindowRateLimiter` in `rate-limiter.ts` stays for TOTP and the public CAPTCHA endpoints |
| `getClientIp()` in `rate-limiter.ts`                               | Returns `unknown` unless `TRUST_PROXY=true`, then takes the **first** (client-controlled) `X-Forwarded-For` entry | Rewritten (SD-34): per-IP limits would otherwise collapse into one bucket or be trivially spoofable                                                                      |
| `security_settings` (4 columns)                                    | Min length, personal-data rule, max age, idle timeout                                                             | +4 columns (SD-33, SD-36)                                                                                                                                                |
| `server/security/log-event.ts`                                     | Operational log line: event name + request id only                                                                | Stays. `security_events` is the new persistent, queryable record (SD-35)                                                                                                 |
| `http/errors.ts` `ApiError`, `toResponse()`                        | Envelope with optional `details`; `toResponse` passes no response headers                                         | New error classes; `ApiError` gets optional headers so `Retry-After` can be sent (SD-37)                                                                                 |
| `app/api/auth/login/route.ts`                                      | Body `{ login, password }`, strict                                                                                | Adds `captcha`, honeypot and form-token fields (SD-37, SD-46, SD-52)                                                                                                     |
| `tests/route-guard-conformance.test.ts`                            | `PUBLIC_ROUTE_ALLOWLIST` = `/api/health`, `/api/auth/login`                                                       | New reviewed public routes are added (SD-43, SD-48, SD-55)                                                                                                               |
| `permissions/codes.ts`, `matrix.ts`, `docs/permissions.md`         | 16 codes                                                                                                          | +7 Administrator-only codes (SD-33)                                                                                                                                      |
| `users/mappers.ts` `AdminUserDto`, `user-queries.ts` status filter | `active` / `blocked` / `pending`                                                                                  | `lockedUntil` and status `locked` (SD-41)                                                                                                                                |
| `core/http/api-error.ts` `describeApiError()`                      | Returns status + code only                                                                                        | Also exposes allowlisted `details` (SD-39)                                                                                                                               |
| `features/login/login.component.*`                                 | Login, password, error banner                                                                                     | CAPTCHA widget, honeypot, lockout countdown                                                                                                                              |
| `docs/testing.md` + `scripts/check-sec-traceability.ts`            | SEC-01 … SEC-30, each must appear in a test title                                                                 | SEC-31 … SEC-62 continue the same mechanism (section 9)                                                                                                                  |
| `playwright.config.ts`, `tests/e2e/*`                              | One worker, no retries, isolated E2E database                                                                     | New specs; CAPTCHA provider stubbed for hermetic runs (SD-63)                                                                                                            |

---

## 3. Architecture and conventions

### 3.1 Layered defence

```
 Browser (Angular)                       Next.js API                              SQLite
 ┌──────────────────────┐   POST /api/auth/login   ┌──────────────────────────────────────────┐
 │ Login form           │ ───────────────────────▶ │ defineRoute: size, Origin, content-type  │
 │  - login, password   │   { login, password,     │ Zod (strict)                             │
 │  - CAPTCHA widget    │     captcha, website,    │ ── login defence pipeline ───────────────│
 │  - hidden honeypot   │     formToken }          │ 1 honeypot filled?   → strike, fake 401  │
 │  - lockout countdown │                          │ 2 IP blocked?        → 429 IP_BLOCKED    │──▶ login_attempts
 └──────────────────────┘                          │ 3 CAPTCHA valid?     → 400 / 403 / 503   │
                                                   │ 4 trap login?        → alert, continue   │──▶ honeytokens, security_events
                                                   │ 5 account locked?    → 429 ACCOUNT_LOCKED│──▶ login_attempts
                                                   │ 6 verify credentials (exactly one Argon2)│
                                                   │ 7 success → session; failure → count     │
                                                   └──────────────────────────────────────────┘
 Password change forms ── POST (+ captcha) ──▶ session, CSRF, **CAPTCHA**, then password checks
 Decoy resource  GET /api/backup/config ───▶ CRITICAL event + Canarytokens alert
```

The order is deliberate: cheap and free-of-side-effect checks first, the paid CAPTCHA verification before anything that reveals account state, and credential verification last so a bot without a valid CAPTCHA token learns nothing about accounts.

### 3.2 Conventions inherited from Module 1 (unchanged)

- Every handler is built with `defineRoute`; public routes must be on the conformance allowlist; no route skips the pipeline.
- Server error messages are Polish, UI texts are English and chosen by the client from the machine-readable `error.code`; the UI never renders server prose.
- Error envelope `{ "error": { "code", "message", "details"? } }`, `Cache-Control: no-store`, `details` holds only fixed codes and numbers, never request content.
- Zod schemas are strict; unknown keys are `400`.
- Time comes from `server/time/clock.ts`; tests use the fake clock and never sleep.
- Operational logs contain only event name and request id. Nothing in this module may log a password, hash, token, CAPTCHA response or answer.
- Drizzle migrations only; no hand-edited schema; every new table gets indexes in the same migration.

### 3.3 New configuration (`.env.example`)

```dotenv
# CAPTCHA (SD-43): provider per form, turnstile | internal | recaptcha
# Login uses the individual variant 2 (reversed string); password change uses Turnstile.
CAPTCHA_LOGIN_PROVIDER=internal
CAPTCHA_PASSWORD_CHANGE_PROVIDER=turnstile
# Cloudflare's published test keys: the widget always passes. Production start-up refuses them.
TURNSTILE_SITE_KEY=1x00000000000000000000AA
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
CAPTCHA_EXPECTED_HOSTNAME=localhost
CAPTCHA_MAX_TOKEN_AGE_SECONDS=120
CAPTCHA_VERIFY_TIMEOUT_MS=3000
CAPTCHA_HMAC_SECRET=replace-with-output-of-openssl-rand-base64-32   # internal provider
# CAPTCHA_TEST_MODE=false   # test only: the internal provider then also accepts the answer TEST-SOLVED
# Client IP (SD-34): behind a reverse proxy the proxy must overwrite X-Forwarded-For
TRUST_PROXY=true
TRUSTED_PROXY_HOPS=1
# Honeytokens (SD-53 to SD-55): URLs and keys come from canarytokens.org, never committed
CANARY_ALERTS_ENABLED=true
CANARY_ACCOUNT_TRAP_URL=
CANARY_DECOY_AWS_ACCESS_KEY_ID=
CANARY_DECOY_AWS_SECRET_ACCESS_KEY=
```

Test-only overrides (`TURNSTILE_VERIFY_URL`, `CAPTCHA_TEST_MODE`) are honoured only when `NODE_ENV !== 'production'`; the start-up check throws if they are set in production (SD-43).

### 3.4 OWASP Automated Threats covered

Credential cracking (OAT-007) by the lockout and IP limits, credential stuffing (OAT-008) by CAPTCHA, IP limits and the trap account, CAPTCHA defeat (OAT-009) by single-use, short validity, action/hostname binding and a second layer behind it. Check the exact identifiers against the current "OWASP Automated Threats to Web Applications" handbook before quoting them in the report.

---

## 4. Data model additions

Names are proposals; invariants matter. All timestamps are UTC epoch milliseconds, as in Module 1.

### 4.1 `login_attempts` (append-only, operational)

| Field              | Type              | Purpose                                                                                                                   |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `id`               | TEXT UUID         | Primary key                                                                                                               |
| `login_normalized` | TEXT, nullable    | Normalized submitted login, **whether or not the account exists**. NULL for IP-level rows (honeypot, CAPTCHA, IP markers) |
| `ip_key`           | TEXT              | Normalized client address (IPv6 collapsed to /64), from SD-34                                                             |
| `kind`             | TEXT              | `CREDENTIAL`, `CAPTCHA`, `HONEYPOT`, `MARKER` (CHECK constraint)                                                          |
| `outcome`          | TEXT              | `PENDING`, `FAILED`, `SUCCESS`, `CLEARED` (CHECK constraint)                                                              |
| `occurred_at`      | INTEGER           | When the attempt was reserved                                                                                             |
| `resolved_at`      | INTEGER, nullable | When its outcome was known                                                                                                |

Indexes: `(login_normalized, occurred_at)`, `(ip_key, occurred_at)`, `(occurred_at)` for purging.

Why append-only: counters are derived by queries instead of mutated state, so concurrent attempts cannot lose updates, an admin unlock is a visible `CLEARED` marker, and nothing needs to be "reset" by deleting rows.

### 4.2 `security_events` (persistent audit trail)

`id` UUID, `type`, `severity` (`INFO` / `WARNING` / `CRITICAL`), `occurred_at`, `ip_key` nullable, `user_agent` nullable (cut to 200 characters), `login_normalized` nullable, `user_id` nullable FK, `honeytoken_id` nullable FK, `details` (JSON text validated per event type), `request_id`, `acknowledged_at` / `acknowledged_by` nullable, `alert_status` (`NONE`, `PENDING`, `SENT`, `FAILED`, `SUPPRESSED`), `alert_attempted_at` nullable. Indexes on `occurred_at`, `(severity, acknowledged_at)`, `type`.

Never stored: passwords, hashes, tokens, CAPTCHA responses or answers. IP addresses and user agents are personal data under GDPR; the retention setting (default 90 days) and the purge job are part of the design (SD-35).

### 4.3 `honeytokens`

`id` TEXT (stable slug, for example `account-trap-backup-admin`), `kind` (`ACCOUNT_TRAP`, `AWS_KEYS`; extensible), `label`, `login_normalized` nullable and unique (account trap only), `alert_url_env` nullable (the **name** of the environment variable holding the Canarytokens URL; the URL itself is a secret and is never stored in the database or repository), `enabled`, `created_at`, `last_triggered_at`, `trigger_count`.

### 4.4 `captcha_challenges` (internal provider only)

`id` UUID, `purpose` (`login`), `answer_mac` (HMAC-SHA256 of the normalized expected answer, keyed with `CAPTCHA_HMAC_SECRET` and bound to the challenge id; the plaintext is never stored), `created_at`, `expires_at` (+120 s), `consumed_at` nullable, `ip_key`. Index on `expires_at`.

### 4.5 `security_settings` additions

| Column                              | Default | Range | Purpose                                                                       |
| ----------------------------------- | ------- | ----- | ----------------------------------------------------------------------------- |
| `max_failed_login_attempts`         | 5       | 3–20  | B-01: failed attempts per login and 15-minute window before the lock          |
| `ip_failed_attempt_limit`           | 20      | 5–500 | B-07: failed attempts per IP and 15-minute window across all logins           |
| `spraying_distinct_login_threshold` | 8       | 3–50  | Distinct logins failed from one IP in the window that raises a spraying event |
| `security_event_retention_days`     | 90      | 7–365 | Purge horizon for `security_events`                                           |

Constants in code, not settings: lock duration **15 minutes** and attempt window **15 minutes** (the PDF fixes the duration). `DEFAULT_SECURITY_SETTINGS`, the table defaults and the seed must stay equal (the existing drift test covers it).

### 4.6 Invariants

- A temporary lock is **not** the administrative block: `users.is_blocked` is untouched by the lockout, and unblocking never clears a lock (and vice versa).
- Lock state is keyed by the normalized submitted login string for existing and non-existing logins alike.
- A honeytoken login must not be creatable as a real user (reserved-login check in the user-creation path).
- No table here is ever read to build a response for an unauthenticated caller except through the pipeline's fixed, allowlisted fields.

---

## 5. Permission additions

All seven codes go to **Administrator only**. Manager, Employee and Guest get none, and `matrix.test.ts` pins that.

| Code                          | Used by                                  |
| ----------------------------- | ---------------------------------------- |
| `security-events:read`        | List and read security events (SD-58)    |
| `security-events:acknowledge` | Acknowledge an event (SD-58)             |
| `users:unlock`                | Clear a temporary account lock (SD-41)   |
| `ip-blocks:read`              | List currently blocked addresses (SD-41) |
| `ip-blocks:clear`             | Clear an IP block (SD-41)                |
| `honeytokens:read`            | See honeytoken status (SD-60)            |
| `honeytokens:test`            | Fire a clearly marked test alert (SD-60) |

Public endpoints added (on the allowlist, rate limited, no session): `GET /api/captcha/config`, `POST /api/captcha/challenge`, `GET /api/backup/config` (decoy).

---

## 6. Behavioural rules

### 6.1 Account lockout (B-01)

1. Attempt window and lock duration are both 15 minutes; N comes from `max_failed_login_attempts` and is read on every attempt, so a change applies immediately.
2. **Reserve, then verify.** Before the Argon2id verification, one synchronous `BEGIN IMMEDIATE` transaction counts the login's open and failed credential attempts in the window and, if below N, inserts a `PENDING` row. Only then is the password verified (asynchronously). Without this, a burst of parallel requests would all pass the check before the first failure is recorded and could try far more than N passwords.
3. Count = rows with `login_normalized = ?`, `kind = 'CREDENTIAL'`, `outcome IN ('PENDING','FAILED')`, `occurred_at > now − 15 min` and later than the newest `SUCCESS` or `CLEARED` row of that login.
4. Count ≥ N means locked until `newest counted attempt + 15 min`. Attempts during the lock are refused **before** any password check, are not recorded and do not extend the lock, so a correct password during a lock is also refused (no oracle) and an attacker cannot keep the lock alive by hammering.
5. The N-th failed attempt itself answers with the lock response (it is the attempt that triggers the lock), with `lockedUntil` and `retryAfterSeconds`.
6. A successful login inserts a `SUCCESS` row, which resets the counter.
7. Blocked, deleted and unknown logins, wrong passwords and expired temporary passwords all count as failures, so lock behaviour cannot reveal account state. Honeypot hits and CAPTCHA failures do **not** count against the account (otherwise a bot could lock anyone's account without solving a CAPTCHA); they count against the IP.
8. The lock response is identical in shape for existing and non-existing logins ("phantom locks"). This is how the PDF's requirement to show the remaining time coexists with Module 1's no-enumeration rule.
9. Known trade-off (control question 3): anyone who can pass the CAPTCHA can lock a known login for 15 minutes, including `ADMIN`. Mitigations in scope: CAPTCHA before counting, per-IP limits, a lock event, administrator unlock (SD-41) and a local CLI unlock for `ADMIN`.

### 6.2 Per-IP limit and spraying (B-07)

Failed attempts of every kind (credential, CAPTCHA, honeypot) are counted per `ip_key` in the same 15-minute window; successes never count, so many honest users behind one NAT are not punished for each other's successes. Count ≥ `ip_failed_attempt_limit` blocks the address until `newest + 15 min` with `429 AUTH_IP_BLOCKED`; the check happens before the CAPTCHA call to save provider requests. Distinct failed logins from one address reaching `spraying_distinct_login_threshold` raise a `PASSWORD_SPRAYING_SUSPECTED` event. Shared addresses (campus or office NAT) can over-block; the limit is configurable and clearable.

### 6.3 CAPTCHA (B-02, B-03)

- The **server** chooses the provider per form (login: internal variant 2, password change: Turnstile); the client cannot pick a weaker one. The Angular widget learns provider, public site key and action from `GET /api/captcha/config?purpose=login|change-password`.
- Verification is always server-side and happens before any credential or password check. Order for login: honeypot, IP block, CAPTCHA, then account logic. Order for password change: session and CSRF, strict Zod parse, CAPTCHA, then current-password verification, so the endpoint cannot serve as a password oracle for a bot.
- Single use: Turnstile tokens are valid for 300 seconds and can be verified once (`timeout-or-duplicate` on a replay); the internal provider consumes a challenge on its first attempt, right or wrong.
- Limited validity: besides the provider's 300 seconds, the server rejects tokens whose `challenge_ts` is older than `CAPTCHA_MAX_TOKEN_AGE_SECONDS` (default 120); internal challenges expire after 120 seconds.
- Binding (Turnstile): the `action` returned by siteverify must equal the form (`login`, `change-password`) and `hostname` must equal `CAPTCHA_EXPECTED_HOSTNAME`, so a token from another form or site is useless.
- Fail closed: provider timeout or 5xx gives `503 CAPTCHA_UNAVAILABLE`; no password change is accepted without a verified CAPTCHA (and no login if the login provider is switched to Turnstile). This is the availability cost of an external dependency (control question 1), which the locally generated login challenge does not have. An optional internal fallback for the password change is SD-51.
- Test keys: Cloudflare's dummy site/secret keys make the widget and verification always succeed. They are the default for development and must be rejected at production start-up, because with the dummy secret every token verifies. The internal provider has the same idea behind `CAPTCHA_TEST_MODE=true`: it additionally accepts the answer `TEST-SOLVED` (the challenge stays single-use and time-limited), for hermetic E2E tests and the bot script's "solving service"; production start-up refuses the flag.

### 6.4 Honeypot (B-04)

A text input the user never sees (positioned off-screen with `tabindex="-1"`, `aria-hidden`, `autocomplete="off"`; not `display:none`, which many bots skip). Any non-empty value means a form-filling bot: the response is the same generic `401 AUTH_INVALID_CREDENTIALS` as a wrong password after the same cost (a dummy hash verification), an IP strike is recorded and a `HONEYPOT_TRIGGERED` event is written; the account counter is untouched. A honeypot only catches bots that fill forms; a script posting JSON directly never sees it and meets the CAPTCHA and the limits instead. Optional timing trap: a signed form-issue timestamp, submissions faster than 1.5 seconds are treated like a filled honeypot.

### 6.5 Honeytokens (B-05)

- Any use of a honeytoken is an incident by definition, because no legitimate flow touches it. That is the answer to control question 4: false positives can only come from the honeytoken being touched by something that should not exist, and the system designs it so that normal users never see it.
- **Token 1, account trap** (`ACCOUNT_TRAP`): a login that is registered as a trap and has **no user row**, so nothing can be compromised. A login attempt with it, with any password, follows the exact unknown-login path (same response, same single dummy verification, counted like any failure) and additionally raises a `CRITICAL` event and an external alert. Bait is planted where an attacker or scraper would look (the decoy resource below).
- **Token 2, decoy resource** (`AWS_KEYS`): `GET /api/backup/config` and a `robots.txt` lure return a believable JSON "backup configuration" that contains the trap login and Canarytokens AWS keys. Fetching it raises a `CRITICAL` `DECOY_RESOURCE_ACCESSED` event; _using_ the keys against AWS makes Canarytokens send its own e-mail (AWS-sourced alerts arrive with a delay of roughly 2 to 30 minutes).
- Alert path: (a) `security_events` row, always; (b) HTTP call to the Canarytokens web-bug URL with a hard timeout, carrying only an event id and token label and **never** attacker input or any password; (c) deduplication: at most one external alert per (token, ip_key) per 5 minutes, events still recorded.
- Canarytokens secrets (URLs, keys) are environment values created by hand at canarytokens.org and are never committed; committed decoy AWS keys would also be harvested by repository scanners.

### 6.6 Security events

Typed registry, each type with a fixed severity and a Zod schema for `details`. Noisy types (`CAPTCHA_FAILED`, `HONEYPOT_TRIGGERED`, `LOGIN_IP_BLOCKED`) are aggregated per (type, ip_key, 5-minute bucket) with a counter in `details`, so a bot cannot flood the table. Types: `ACCOUNT_LOCKED`, `LOGIN_IP_BLOCKED`, `CAPTCHA_FAILED`, `CAPTCHA_PROVIDER_ERROR`, `HONEYPOT_TRIGGERED`, `HONEYTOKEN_TRIGGERED` (CRITICAL), `DECOY_RESOURCE_ACCESSED` (CRITICAL), `PASSWORD_SPRAYING_SUSPECTED`, `CHANGE_PASSWORD_BRUTE_FORCE`, `ACCOUNT_UNLOCKED_BY_ADMIN`, `IP_BLOCK_CLEARED_BY_ADMIN`, `SECURITY_SETTINGS_CHANGED`.

---

## 7. API contract

### 7.1 Error codes added (messages are Polish, UI words its own text)

| Status | `error.code`               | Server message                                                               | `details`                                     | When                                                   |
| ------ | -------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| 429    | `AUTH_ACCOUNT_LOCKED`      | Konto jest tymczasowo zablokowane po zbyt wielu nieudanych próbach logowania | `lockedUntil` (ISO-8601), `retryAfterSeconds` | Lock active or just triggered; `Retry-After` header    |
| 429    | `AUTH_IP_BLOCKED`          | Zbyt wiele nieudanych prób logowania z tego adresu. Spróbuj ponownie później | `retryAfterSeconds`                           | IP limit; `Retry-After` header                         |
| 400    | `CAPTCHA_REQUIRED`         | Wymagane potwierdzenie CAPTCHA                                               | —                                             | Token or answer missing                                |
| 403    | `CAPTCHA_FAILED`           | Nie udało się zweryfikować CAPTCHA                                           | —                                             | Invalid, expired, replayed, wrong action or hostname   |
| 503    | `CAPTCHA_UNAVAILABLE`      | Weryfikacja CAPTCHA jest chwilowo niedostępna                                | —                                             | Provider timeout or error (fail closed)                |
| 401    | `AUTH_INVALID_CREDENTIALS` | Login lub hasło niepoprawne                                                  | —                                             | Unchanged; also the answer to honeypot and trap logins |

`429 RATE_LIMITED` stays for TOTP and the public CAPTCHA endpoints.

### 7.2 Changed endpoints

| Method    | Route                                      | Change                                                                                                                                                    |
| --------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST      | `/api/auth/login`                          | Body adds `captcha` (`{ token }` or `{ challengeId, answer }`), `website` (honeypot, must be empty or absent) and optional `formToken`; all fields strict |
| POST      | `/api/auth/change-password`                | Body adds `captcha { token }`; verified before the current password                                                                                       |
| POST      | `/api/auth/change-initial-password`        | Same as above                                                                                                                                             |
| PATCH/GET | `/api/admin/security-settings`             | Four new settings                                                                                                                                         |
| GET       | `/api/admin/users`, `/api/admin/users/:id` | `lockedUntil` in the DTO, `status=locked` filter                                                                                                          |

### 7.3 New endpoints

| Method | Route                                        | Auth                          | Behaviour                                                                                                                    |
| ------ | -------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/captcha/config?purpose=`               | Public, rate limited          | `{ provider, siteKey?, action, formToken? }`; `siteKey` is public by design                                                  |
| POST   | `/api/captcha/challenge`                     | Public, rate limited          | Internal provider only: `{ challengeId, image, expiresAt, instruction }`; the image carries glyph outlines, never the string |
| GET    | `/api/backup/config`                         | Public decoy                  | Believable fake config; raises `DECOY_RESOURCE_ACCESSED`                                                                     |
| GET    | `/api/admin/security-events`                 | `security-events:read`        | Paginated, filter by type, severity, acknowledged, date                                                                      |
| POST   | `/api/admin/security-events/:id/acknowledge` | `security-events:acknowledge` | Marks acknowledged                                                                                                           |
| POST   | `/api/admin/users/:id/unlock`                | `users:unlock`                | Clears the temporary lock (marker row), event                                                                                |
| GET    | `/api/admin/ip-blocks`                       | `ip-blocks:read`              | Currently blocked keys with remaining time                                                                                   |
| DELETE | `/api/admin/ip-blocks/:ipKey`                | `ip-blocks:clear`             | Clears an IP block                                                                                                           |
| GET    | `/api/admin/honeytokens`                     | `honeytokens:read`            | Status, last trigger, count (no URLs, no keys)                                                                               |
| POST   | `/api/admin/honeytokens/:id/test`            | `honeytokens:test`            | Sends a marked test alert                                                                                                    |

---

## 8. Detailed implementation backlog

### Task ID map

| Epic                           | Tasks                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| 7 Abuse-Defence Foundation     | 7.1 = SD-33, 7.2 = SD-34, 7.3 = SD-35, 7.4 = SD-36                                                                  |
| 8 Login Abuse Protection       | 8.1 = SD-37, 8.2 = SD-38, 8.3 = SD-39, 8.4 = SD-40, 8.5 = SD-41, 8.6 = SD-42                                        |
| 9 CAPTCHA                      | 9.1 = SD-43, 9.2 = SD-44, 9.3 = SD-45, 9.4 = SD-46, 9.5 = SD-47, 9.6 = SD-48, 9.7 = SD-49, 9.8 = SD-50, 9.9 = SD-51 |
| 10 Bot Traps and Honeytokens   | 10.1 = SD-52, 10.2 = SD-53, 10.3 = SD-54, 10.4 = SD-55, 10.5 = SD-56, 10.6 = SD-57                                  |
| 11 Security Visibility         | 11.1 = SD-58, 11.2 = SD-59, 11.3 = SD-60                                                                            |
| 12 Verification and Submission | 12.1 = SD-61, 12.2 = SD-62, 12.3 = SD-63, 12.4 = SD-64                                                              |

---

## EPIC 7 — Abuse-defence foundation

### SD-33 / Task 7.1 — Module 2 schema, migrations and seed extensions

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], database, security · **Depends on:** Module 1 (SD-03, SD-12)

**Objective:** Create the persistent state every later task needs: attempt tracking, security events, honeytoken registry, internal CAPTCHA challenges, the new settings and permission codes.

**Implementation checklist**

- Add Drizzle schema files `login-attempts.ts`, `security-events.ts`, `honeytokens.ts`, `captcha-challenges.ts` in `apps/backend/src/server/db/schema/`, export them from `schema/index.ts`; generate migration `0004_*` with `npm run db:generate`. CHECK constraints for `kind`, `outcome`, `severity`, `alert_status` and honeytoken `kind`; indexes from section 4.
- Extend `security_settings` with the four columns and CHECKs (`max_failed_login_attempts BETWEEN 3 AND 20`, and so on). Update `SecuritySettings`, `DEFAULT_SECURITY_SETTINGS` and `readSecuritySettings` in `security/settings.ts` and the drift test.
- Add the seven permission codes to `permissions/codes.ts`, descriptions and the Administrator mapping to `permissions/matrix.ts`; update `docs/permissions.md` (the doc-sync test must stay green) and `matrix.test.ts`.
- Update `docs/database-schema.md` / `.mmd` and the ER-diagram test.
- Keep migrations append-only; reset and seed scripts must still work on a fresh database.

**Acceptance criteria**

- [ ] `npm run db:migrate` on an empty and on a Module 1 database applies cleanly; existing rows survive; `PRAGMA foreign_key_check` is empty.
- [ ] Inserting a `login_attempts` row with an unknown `kind` or `outcome`, or settings outside the ranges, fails at the database level.
- [ ] `matrix.test.ts` proves Administrator holds exactly the seven new codes and the other roles none of them.
- [ ] `docs/permissions.md` and the ER diagram match the schema.

### SD-34 / Task 7.2 — Trusted client IP resolution

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], backend, security · **Depends on:** Module 1 (SD-27)

**Objective:** Per-IP limits are only as good as the address they key on. Today `getClientIp()` returns `unknown` unless `TRUST_PROXY=true` and then trusts the leftmost `X-Forwarded-For` entry, which a client can set. Every limit in this module would collapse into one bucket or be bypassable by rotating a header.

**Implementation checklist**

- New `server/security/client-ip.ts` returning `{ raw, key }`; `getClientIp` in `rate-limiter.ts` delegates to it (callers: login route, TOTP service, CAPTCHA endpoints).
- With `TRUST_PROXY=true` use the entry `TRUSTED_PROXY_HOPS` from the **right** of `X-Forwarded-For`, never the leftmost; reject values that are not valid IPs (`net.isIP`).
- Normalize IPv4-mapped IPv6 (`::ffff:203.0.113.5` → `203.0.113.5`); collapse IPv6 to its /64 prefix for the key.
- Without a trusted proxy return a fixed `unknown` key and log a start-up warning when `NODE_ENV=production`.
- Development: set `xfwd: true` in `apps/frontend/proxy.conf.json`, and `TRUST_PROXY=true`, `TRUSTED_PROXY_HOPS=1` in `.env.example`, so local per-IP tests see a real address.
- Document the deployment rule: the reverse proxy must overwrite, not append, the header.

**Acceptance criteria**

- [ ] A forged `X-Forwarded-For: 1.2.3.4, 198.51.100.7` with `TRUSTED_PROXY_HOPS=1` resolves to `198.51.100.7`; rotating the forged left part never changes the key (SEC-56).
- [ ] Without `TRUST_PROXY` the header is ignored entirely.
- [ ] IPv6 addresses in one /64 share a key; IPv4-mapped IPv6 equals its IPv4 form.
- [ ] Malformed header values fall back to `unknown`, never throw.
- [ ] Minimum 80% test coverage for this module.

### SD-35 / Task 7.3 — Security event service, retention and alert dispatcher

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], backend, security · **Depends on:** SD-33

**Objective:** Give lockouts, bot detections and honeytoken hits one persistent, typed, redacted record plus a pluggable alert path that never blocks or breaks a request.

**Implementation checklist**

- `server/security/events.ts`: registry mapping each event type to severity and a Zod `details` schema; `recordSecurityEvent(db, input)` (synchronous insert, returns the id); `recordAggregated(...)` for noisy types (bucket key = type + ip_key + 5-minute bucket, counter in `details`).
- Redaction guard: refuse (throw in test, drop in production) any `details` key matching `/password|token|secret|answer|captcha/i`; user agent cut to 200 characters.
- `AlertDispatcher` interface `{ id; send(event): Promise<AlertResult> }` and a registry; dispatch is fire-and-forget with a hard timeout, writes back `alert_status`, and a failing dispatcher can never fail the request or lose the event.
- Retention: `server/maintenance/purge.ts` deletes `login_attempts` older than 24 hours, `captcha_challenges` older than 1 hour and `security_events` past `security_event_retention_days` (never an unacknowledged `CRITICAL` event younger than twice the horizon). Run throttled (at most every 5 minutes) from the write path and via `npm run maintenance:purge`.
- Keep `log-event.ts` as is for operational logs; security-relevant call sites also call `recordSecurityEvent`.
- Document IP and user-agent retention (GDPR) in `docs/architecture.md`.

**Acceptance criteria**

- [ ] Every event type in the registry has a severity and a schema; an event with an undeclared or secret-looking `details` key is rejected.
- [ ] 1000 identical `CAPTCHA_FAILED` events from one address in one bucket produce one row with `details.count = 1000`.
- [ ] A dispatcher that throws or hangs leaves the triggering request successful and sets `alert_status = FAILED` (SEC-54).
- [ ] The purge job removes only rows past their horizon and keeps unacknowledged recent `CRITICAL` events (fake clock).
- [ ] Minimum 80% test coverage for this module.

### SD-36 / Task 7.4 — Abuse-defence settings (API and admin UI)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-01, admin, backend, frontend · **Depends on:** SD-33, Module 1 (SD-20)

**Objective:** The administrator sets the number of failed attempts that triggers the lock (B-01), plus the IP limit, the spraying threshold and the event retention, in the existing security settings page.

**Implementation checklist**

- Extend `SecuritySettingsPatch` in `security/schemas.ts` (strict, same partial/refine pattern) with `maxFailedLoginAttempts` 3–20, `ipFailedAttemptLimit` 5–500, `sprayingDistinctLoginThreshold` 3–50, `securityEventRetentionDays` 7–365; extend `settings-service.ts` and the route response to eight settings.
- Record a `SECURITY_SETTINGS_CHANGED` event with the changed keys and the admin id.
- Angular `features/admin-security/security-settings.component.ts`: new "Login protection" group with number inputs, inline server errors and read-only text "Lock duration: 15 minutes · attempt window: 15 minutes"; update `admin-api.service.ts` types and specs.

**Acceptance criteria**

- [ ] Administrator saves and re-reads all eight settings after a backend restart; other roles get `403`.
- [ ] `maxFailedLoginAttempts` of 2 or 21, an unknown key and an empty body return `400`; the database CHECKs refuse the same values (SEC-37).
- [ ] Changing N is used by the very next login attempt (integration test with the lockout from SD-38).
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 8 — Login abuse protection

### SD-37 / Task 8.1 — Login defence pipeline and error contract

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], backend, security · **Depends on:** SD-33, SD-34, SD-35

**Objective:** Replace the single `loginRateLimiter` hook with an explicit, ordered pipeline so honeypot, IP block, CAPTCHA, trap check and lockout can be added as independent stages with a fixed response contract, and the existing one-verification-per-attempt invariant is preserved.

**Implementation checklist**

- New `server/auth/login-guard.ts`: `LoginAttemptContext { ip, normalizedLogin, userAgent, requestId, now }`, an ordered list of stages (`honeypot`, `ipBlock`, `captcha`, `honeytoken`, `accountLock`), each returning `continue` or a typed refusal. Stages are registered by SD-52, SD-40, SD-46, SD-54 and SD-38; this task ships the skeleton with pass-through stages.
- Refactor `authenticate()` in `login-service.ts` to run inside the guard and to receive the reserved attempt handle; remove `loginRateLimiter` from it. `login-rate-limiter.ts` and its test are deleted once SD-38 replaces its per-login rule and SD-40 replaces its per-IP rule; if SD-40 is not built, keep the per-IP window so the Module 1 protection does not disappear. Keep `SlidingWindowRateLimiter` for TOTP and the public CAPTCHA endpoints.
- `http/errors.ts`: add `AccountLockedError`, `IpBlockedError`, `CaptchaRequiredError`, `CaptchaFailedError`, `CaptchaUnavailableError`; give `ApiError` an optional `headers` field and make `toResponse()` pass it, so `Retry-After` is actually sent.
- Extend the strict body schema in `login/route.ts` (`captcha`, `website`, `formToken`).
- Document the stage order and the response contract (section 7.1) in `docs/architecture.md`.

**Acceptance criteria**

- [ ] A test asserts the stage order and that no stage after `captcha` runs when CAPTCHA fails (spy-based).
- [ ] Wrong password, unknown login, blocked and deleted accounts and an expired temporary password still produce byte-identical `401` bodies and exactly one Argon2id verification (existing tests stay green).
- [ ] `429` responses carry a `Retry-After` header and `details` with fixed numeric/ISO fields only.
- [ ] Minimum 80% test coverage for this module.

### SD-38 / Task 8.2 — Attempt tracker and account lockout (B-01)

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] B-01, backend, security · **Depends on:** SD-33, SD-36, SD-37

**Objective:** After N failed attempts for a login within 15 minutes the login is locked for 15 minutes, N is set by the administrator, the response carries the remaining time, and the mechanism is persistent, race-free and does not reveal which accounts exist.

**Implementation checklist**

- `server/security/attempt-tracker.ts` over the `login_attempts` table implementing section 6.1:
  ```ts
  reserveCredentialAttempt(tx, { loginNormalized, ipKey, now, maxAttempts }):
    | { status: 'reserved'; attemptId: string }
    | { status: 'locked'; lockedUntil: Date };
  resolveAttempt(db, attemptId, outcome: 'FAILED' | 'SUCCESS', ctx): { lockedUntil?: Date };
  clearAccount(db, loginNormalized, now): void;   // inserts a CLEARED marker
  ```
- Reservation runs in `db.transaction(..., { behavior: 'immediate' })` and is synchronous; the Argon2id verification happens after it.
- The `accountLock` stage returns `AccountLockedError` (429) with `lockedUntil` and `retryAfterSeconds` computed from the injected clock; the N-th failure answers with the same error.
- Failures counted: all credential failures for known and unknown logins; not counted: honeypot, CAPTCHA, IP-block refusals. `users.is_blocked` is never touched.
- Emit `ACCOUNT_LOCKED` once at the transition (not on every refused attempt).
- Local CLI recovery for the sole administrator account: `npm run admin:unlock -- ADMIN` (shell access to the database is already a trusted position).

**Acceptance criteria**

- [ ] With N = 5, attempts 1–4 with a wrong password give `401`; attempt 5 gives `429 AUTH_ACCOUNT_LOCKED` with `retryAfterSeconds` ≈ 900 (SEC-31).
- [ ] With the fake clock: still locked at +14 min 59 s, accepted again at +15 min (SEC-32).
- [ ] The correct password during a lock is refused and the lock end does not move (SEC-33).
- [ ] An existing and a non-existing login produce responses with identical status, code and `details` shape (SEC-34).
- [ ] A successful login resets the counter (SEC-35).
- [ ] 50 parallel wrong attempts for one login result in at most N credential verifications (SEC-36).
- [ ] Locking does not change `is_blocked`; administrator unblock does not clear a lock (SEC-39).
- [ ] Lock state survives a simulated backend restart (SEC-59).
- [ ] Minimum 80% test coverage for this module.

### SD-39 / Task 8.3 — Login lockout countdown (B-01 UI)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-01, frontend · **Depends on:** SD-38

**Objective:** The login screen must show the remaining block time. The countdown is a courtesy computed from the server's `retryAfterSeconds`; the server stays the authority.

**Implementation checklist**

- `core/http/api-error.ts`: add `apiErrorDetails()` returning allowlisted numeric/ISO fields (`retryAfterSeconds`, `lockedUntil`) next to `describeApiError`.
- `features/login/login.component.ts`: on `429` with `AUTH_ACCOUNT_LOCKED` start a countdown signal from `retryAfterSeconds` using a monotonic timer (`performance.now()` deltas), not the client wall clock; show "Too many failed attempts. Try again in 14:32."; keep the form visible but disable submit until zero, then re-enable and announce "You can try again now".
- Accessibility: the countdown is in the existing `role="alert"` region; update screen-reader text on minute boundaries and at zero, not every second.
- On `AUTH_IP_BLOCKED` show a distinct network-level message with its own countdown; on a reload nothing is stored client-side (no new storage use).
- Specs for the component, including a fake-timer countdown test.

**Acceptance criteria**

- [ ] A mocked `429` with `retryAfterSeconds: 872` renders `14:32`, decrements, disables submit, and re-enables at `00:00` (fake timers).
- [ ] The text is derived from `retryAfterSeconds`, not from the server message.
- [ ] No `localStorage`/`sessionStorage` use is added (existing storage test stays green).
- [ ] axe-style check passes; the live region is not announced every second.
- [ ] Minimum 80% test coverage for this module.

### SD-40 / Task 8.4 — Per-IP throttling and password-spraying detection (extra)

**Priority:** P1 · **Size:** M · **Labels:** [EXTRA] B-07, backend, security · **Depends on:** SD-34, SD-36, SD-37, SD-38

**Objective:** Limit failed login attempts per address regardless of login (the PDF's extra task) and detect the spraying pattern: one address failing against many different logins.

**Implementation checklist**

- Add the `ipBlock` stage: count `PENDING`/`FAILED` rows of any `kind` per `ip_key` in the window, later than the newest IP-level `CLEARED` marker; at `ip_failed_attempt_limit` refuse with `IpBlockedError` before the CAPTCHA call; emit `LOGIN_IP_BLOCKED` (aggregated).
- Spraying signal: when a failure makes `COUNT(DISTINCT login_normalized)` for the address in the window reach `spraying_distinct_login_threshold`, record `PASSWORD_SPRAYING_SUSPECTED` once per bucket.
- Record CAPTCHA failures and honeypot hits as IP-level failed rows (SD-46, SD-52 call the same function).
- Remove the old per-IP rule of `login-rate-limiter.ts` (this stage supersedes it).
- Document NAT and shared-address trade-offs.

**Acceptance criteria**

- [ ] With limit L = 20, the 21st failed attempt from one address (across 21 different logins) returns `429 AUTH_IP_BLOCKED`; another address is unaffected (SEC-55).
- [ ] Forged `X-Forwarded-For` rotation does not evade the limit with correct proxy settings (SEC-56).
- [ ] 8 distinct logins failed from one address raise exactly one spraying event per bucket (SEC-57).
- [ ] Successful logins from the address do not increase its count.
- [ ] Block state survives a restart (SEC-59).
- [ ] Minimum 80% test coverage for this module.

### SD-41 / Task 8.5 — Administrator lockout management

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], admin, backend, frontend · **Depends on:** SD-33, SD-38, SD-40

**Objective:** Because lockout can be abused to deny service (control question 3), the administrator needs to see locked accounts and blocked addresses and clear them, with an audit trail.

**Implementation checklist**

- `POST /api/admin/users/[id]/unlock` (`users:unlock`) inserts a `CLEARED` marker for the user's login; event `ACCOUNT_UNLOCKED_BY_ADMIN`.
- `GET /api/admin/ip-blocks` (`ip-blocks:read`) and `DELETE /api/admin/ip-blocks/[ipKey]` (`ip-blocks:clear`); event `IP_BLOCK_CLEARED_BY_ADMIN`.
- Add `lockedUntil` to `AdminUserDto`/`toAdminUserDto` and a `locked` value to the `status` filter in `user-queries.ts`.
- Angular: status badge "Locked until HH:MM" in `user-status.ts`/`user-status-badge.component.ts`, an "Unlock" button with `ConfirmDialogComponent` in `user-detail.component.ts`, and an "Address blocks" table on the security events page (SD-59) or a small dedicated view.
- If the address-blocks table gets its own Angular route, register it and its nav entry together (`app.routes.ts`, `nav-items.ts`; their spec checks that the nav permission equals the route permission).

**Acceptance criteria**

- [ ] After unlock the account can attempt a login immediately and the counter starts from zero (SEC-38).
- [ ] Non-admin roles get `403`; unlock of a non-locked account is idempotent.
- [ ] Both admin actions create an event with the acting admin id.
- [ ] The users list shows and filters locked accounts.
- [ ] Minimum 80% test coverage for this module.

### SD-42 / Task 8.6 — Change-password brute-force protection

**Priority:** P1 · **Size:** S · **Labels:** [HARDENING], backend, security · **Depends on:** SD-33, SD-35, Module 1 (SD-11)

**Objective:** A stolen session cookie must not let an attacker guess the current password through `change-password`. Module 1 only noted the idea; this makes it real.

**Implementation checklist**

- Count wrong `currentPassword` submissions per user and window (a `CREDENTIAL`-independent kind or a `SlidingWindowRateLimiter` keyed `pwchange:<userId>` persisted through the attempt table); at `maxFailedLoginAttempts` revoke all of the user's sessions and refuse further tries for 15 minutes.
- Emit `CHANGE_PASSWORD_BRUTE_FORCE`; do not touch the login lock.
- The check runs after the CAPTCHA (SD-47) and before the Argon2 verification.

**Acceptance criteria**

- [ ] The N-th wrong current password revokes the session; the old cookie returns `401` (SEC-60).
- [ ] A correct password during the 15-minute refusal is still refused.
- [ ] The login lock of the same user is unaffected.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 9 — CAPTCHA

### SD-43 / Task 9.1 — CAPTCHA provider abstraction, configuration and CSP

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, security · **Depends on:** SD-33, SD-34

**Objective:** One interface for every CAPTCHA mechanism so login and password change do not know which one is active, the server (not the client) picks the provider, and misconfiguration cannot silently disable the protection.

**Implementation checklist**

- `server/security/captcha/provider.ts`:
  ```ts
  export type CaptchaPurpose = 'login' | 'change-password';
  export type CaptchaFailure =
    | 'MISSING'
    | 'INVALID'
    | 'EXPIRED'
    | 'DUPLICATE'
    | 'WRONG_ACTION'
    | 'WRONG_HOSTNAME'
    | 'UNAVAILABLE';
  export interface CaptchaProvider {
    readonly id: 'turnstile' | 'internal' | 'recaptcha';
    publicConfig(purpose: CaptchaPurpose): { provider: string; siteKey?: string; action: string };
    verify(
      input: unknown,
      ctx: { purpose: CaptchaPurpose; ipKey: string; now: Date },
    ): Promise<{ ok: true } | { ok: false; reason: CaptchaFailure }>;
  }
  ```
- `server/security/captcha/index.ts`: `getCaptchaProvider(purpose)` from `CAPTCHA_LOGIN_PROVIDER` / `CAPTCHA_PASSWORD_CHANGE_PROVIDER`; `assertCaptchaConfig()` called at start-up and in tests: in production refuse Cloudflare dummy keys (site keys `1x…`, `2x…`, `3x…`; secrets `1x…`, `2x…`, `3x…`), missing secrets, and any test-only override variable.
- `GET /api/captcha/config?purpose=` (public, on the conformance allowlist, `SlidingWindowRateLimiter` 60/min per address, strict query schema).
- Map failures to errors: `MISSING` → `CaptchaRequiredError`, `UNAVAILABLE` → `CaptchaUnavailableError`, everything else → `CaptchaFailedError`; record `CAPTCHA_FAILED`/`CAPTCHA_PROVIDER_ERROR` events and an IP-level failed attempt.
- SPA CSP guidance in `docs/architecture.md`: add `script-src https://challenges.cloudflare.com` and `frame-src https://challenges.cloudflare.com`; `connect-src` is not required for the standard widget. The API's own `default-src 'none'` policy stays.

**Acceptance criteria**

- [ ] Starting with `NODE_ENV=production` and a dummy Turnstile key or secret throws (SEC-62 variant).
- [ ] The config endpoint reveals provider, public site key and action only; never a secret; unknown `purpose` is `400`.
- [ ] A new public route without the allowlist entry fails the conformance test; the three new routes are listed.
- [ ] Minimum 80% test coverage for this module.

### SD-44 / Task 9.2 — Cloudflare Turnstile server-side verification

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-03, backend, security · **Depends on:** SD-43

**Objective:** Implement the ready-solution adapter the PDF requires for the password-change form (B-03); the student confirmed Turnstile is acceptable. The client-side result can be forged, so every token is verified against Cloudflare's siteverify endpoint with extra server-side checks the PDF's "limited validity, one-time" rule needs.

**Implementation checklist**

- `server/security/captcha/turnstile.ts` using global `fetch`: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` with `secret`, `response` and `remoteip` (the resolved client address), `AbortSignal.timeout(CAPTCHA_VERIFY_TIMEOUT_MS)` (3 s); no retries that could double-spend a token unless an `idempotency_key` (UUID) is sent.
- Accept only `success === true`; require `action === purpose` and `hostname === CAPTCHA_EXPECTED_HOSTNAME`; reject when `challenge_ts` is older than `CAPTCHA_MAX_TOKEN_AGE_SECONDS`; reject tokens over 2048 characters before the call.
- Map error codes: `timeout-or-duplicate` → `DUPLICATE`/`EXPIRED`; `invalid-input-response`/`missing-input-response` → `INVALID`/`MISSING`; `internal-error`, network failure or non-2xx → `UNAVAILABLE` (fail closed).
- `TURNSTILE_VERIFY_URL` override for stubs, honoured only outside production.
- Never log the token, the secret or the full provider response.

**Acceptance criteria**

- [ ] With a stubbed siteverify: success passes; `success:false`, wrong action, wrong hostname, and a `challenge_ts` 121 s old each fail with the right reason (SEC-42).
- [ ] A fetch timeout and a `500` give `UNAVAILABLE` and the caller returns `503`, with no credential verification performed (SEC-43).
- [ ] The request body sent to the stub contains the secret and the client address but the secret appears in no log line (log-capture test).
- [ ] With Cloudflare's "always passes" test secret the dummy token verifies; with the "duplicate" test secret it fails as a replay (manual online check recorded in the runbook).
- [ ] Minimum 80% test coverage for this module.

### SD-45 / Task 9.3 — Angular CAPTCHA widget component

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-02/B-03, frontend · **Depends on:** SD-43

**Objective:** One reusable component renders whichever provider the server chose for the form (the reversed-string challenge at login, Turnstile at password change), emits the proof, and handles expiry and reset, so forms stay simple.

**Implementation checklist**

- `shared/ui/captcha/captcha.component.ts` (standalone): loads provider config from `GET /api/captcha/config?purpose=` via a `CaptchaApiService`; lazily injects `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` once; renders with explicit options `{ sitekey, action, callback, 'expired-callback', 'error-callback', 'timeout-callback' }`; exposes `token` signal and `reset()`.
- A token is single-use: forms call `reset()` after **every** submission, successful or not; tokens expire after 300 s, so `expired-callback` clears the token and disables submit.
- Cleans up on destroy (`turnstile.remove`); shows a retry state when the script cannot load (script blocked, offline); announces status through an `aria-live` region.
- Provider-specific rendering is in child components the internal variant (SD-49) is the child used at login and plugs into the same contract.

**Acceptance criteria**

- [ ] Component tests with a faked `window.turnstile` cover render, token emit, expiry, error, reset and destroy.
- [ ] The form's submit button is disabled until a token exists and again after expiry.
- [ ] A load failure shows a retry control and never lets the form submit without a token.
- [ ] Minimum 80% test coverage for this module.

### SD-46 / Task 9.4 — CAPTCHA at login (B-02, variant 2)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-02, [VARIANT], backend, frontend, security · **Depends on:** SD-37, SD-39, SD-45, SD-48, SD-49

**Objective:** Make a valid, fresh, one-time CAPTCHA proof a precondition of every login attempt, checked before any account logic. The login uses the individual variant 2 (reversed string) provider; the same stage works unchanged with Turnstile if `CAPTCHA_LOGIN_PROVIDER` is switched.

**Implementation checklist**

- Backend `captcha` stage in the pipeline, using `getCaptchaProvider('login')`: missing proof → `400 CAPTCHA_REQUIRED`; wrong answer, expired or already used challenge (or, with Turnstile, replayed token, wrong action or hostname) → `403 CAPTCHA_FAILED`; provider down → `503`; each failure is an IP-level failed attempt and an aggregated event; nothing about the login or password is looked at.
- Frontend: add `<app-captcha purpose="login">` (renders the reversed-string challenge) to `login.component.html`, add `captcha` to `LoginRequest` in `auth-api.service.ts`, request a new challenge after every attempt, map the three new error codes to English texts ("Type the characters in reverse order", "Verification failed, try again", "Verification is temporarily unavailable").
- Keep the generic invalid-credentials behaviour untouched.

**Acceptance criteria**

- [ ] A login request without `captcha` returns `400 CAPTCHA_REQUIRED` and a spy proves no password verification and no lockout counting happened (SEC-40).
- [ ] A wrong, expired and already used challenge each return `403` and are counted against the IP only (SEC-41).
- [ ] A correct reversed answer with a wrong password returns `401` and counts toward the account lock.
- [ ] A new challenge is requested after every failed attempt and the next submission needs a fresh answer.
- [ ] Minimum 80% test coverage for this module.

### SD-47 / Task 9.5 — CAPTCHA at password change (B-03)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-03, backend, frontend, security · **Depends on:** SD-44, SD-45, Module 1 (SD-09, SD-11)

**Objective:** A password-change form without a valid Cloudflare Turnstile token (the ready-provider verification the PDF asks for) is rejected. Applies to both password-change endpoints, because the forced initial change is also a password-change form.

**Implementation checklist**

- Add `captcha: { token }` to the strict schemas of `change-password/route.ts` and `change-initial-password/route.ts`; verify with purpose `change-password` after session, CSRF and Zod, **before** current-password verification and password-policy checks; failure leaves the stored hash and history untouched.
- Angular: `features/password/change-password.component.ts` and `change-initial-password.component.ts` use the shared `password-form.ts` helper plus `<app-captcha purpose="change-password">`; reset after every submit; extend `ChangePasswordRequest`/`ChangeInitialPasswordRequest`.
- The spec for each component covers missing, expired and reset behaviour.

**Acceptance criteria**

- [ ] A request without a token is rejected (`400`), with a forged token `403`, and `users.password_hash` and `password_history` are byte-identical afterwards (SEC-44).
- [ ] A valid token with a valid change succeeds once; replaying the same token for a second change fails (SEC-45).
- [ ] CAPTCHA is verified before the current password is checked (spy order test).
- [ ] The two Module 1 password-change suites are updated and stay green.
- [ ] Minimum 80% test coverage for this module.

### SD-48 / Task 9.6 — Internal CAPTCHA backend: reversed string (variant 2)

**Priority:** P0 · **Size:** L · **Labels:** [VARIANT] B-02, [ASSIGNMENT], backend, security · **Depends on:** SD-33, SD-43

**Objective:** Implement the individual variant No. 2 and use it as the login CAPTCHA (the student applies the variant in every module): the user retypes a random string in reverse order. It makes the one-time and time-limited challenge lifecycle explicit, needs no external service, and is the deterministic provider for hermetic tests. It is a coursework mechanism, weak against OCR; the report says so.

**Implementation checklist**

- `server/security/captcha/internal.ts` implementing `CaptchaProvider`: string of 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` via `crypto.randomInt`; expected answer = reversed string; store only `answer_mac` = HMAC-SHA256(`CAPTCHA_HMAC_SECRET`, `challengeId + expected`).
- `POST /api/captcha/challenge` (public, allowlist, limiter 20 per minute per address, global cap on unconsumed rows): returns `{ challengeId, image, expiresAt, instruction }` where `image` is an SVG data URL of per-glyph **paths** (rotation, offset, noise lines) built with `opentype.js` 2.x and a bundled OFL-licensed font; no `<text>` node and no plain string anywhere in the response.
- Verify: atomically `UPDATE … SET consumed_at = now WHERE id = ? AND consumed_at IS NULL AND expires_at > now` first (one attempt per challenge, right or wrong), then compare the HMAC in constant time with the trimmed, upper-cased answer. TTL 120 s.
- Test mode: `CAPTCHA_TEST_MODE=true` makes the provider additionally accept the answer `TEST-SOLVED` (still single-use and time-limited); used by E2E and by the bot script's "solving service" scenario. No HTTP endpoint ever returns the real answer; an in-process helper returns it for integration tests. Boot refuses `CAPTCHA_TEST_MODE` in production.
- Accessibility note and limits in `docs/architecture.md` (an image CAPTCHA needs an alternative modality; Turnstile is the alternative).

**Acceptance criteria**

- [ ] Typing the string in the original order fails; the reversed string passes (SEC-48).
- [ ] The second use of a challenge fails even with the correct answer; a wrong first answer also burns it (SEC-46).
- [ ] An answer at +119 s passes, at +121 s fails (fake clock) (SEC-47).
- [ ] The challenge response and the database contain neither the plaintext string nor `<text>` glyphs (assertion on the SVG source and a DB dump).
- [ ] Issuing more than the allowed challenges per minute returns `429`; expired rows are purged.
- [ ] With `CAPTCHA_TEST_MODE=true` the answer `TEST-SOLVED` passes once and fails on reuse; starting in production with the flag set throws (SEC-62).
- [ ] Minimum 80% test coverage for this module.

### SD-49 / Task 9.7 — Internal CAPTCHA Angular component

**Priority:** P0 · **Size:** M · **Labels:** [VARIANT] B-02, [ASSIGNMENT], frontend · **Depends on:** SD-45, SD-48

**Objective:** Present the reversed-string challenge on the login form behind the same widget contract, so switching a form's provider changes no form code.

**Implementation checklist**

- `shared/ui/captcha/internal-captcha.component.ts`: fetches a challenge, shows the image with the instruction "Type the characters in reverse order", an answer input, a "new challenge" button and an expiry countdown; emits `{ challengeId, answer }` through the same output as the Turnstile component; auto-requests a new challenge when it expires or after every submission.
- The login form sends `{ challengeId, answer }` and the password-change forms send `{ token }` as `captcha`.
- Labels, `aria-describedby`, keyboard operation.

**Acceptance criteria**

- [ ] With `CAPTCHA_LOGIN_PROVIDER=internal` the login flow works end to end in a component/integration test with no external network.
- [ ] An expired challenge is replaced automatically and the stale answer is discarded.
- [ ] The answer input and the new-challenge button are operable by keyboard only and the input has an associated label (component test).
- [ ] Minimum 80% test coverage for this module.

### SD-50 / Task 9.8 — Google reCAPTCHA adapter (optional)

**Priority:** P2 · **Size:** M · **Labels:** [OPTIONAL] B-03, backend, frontend · **Depends on:** SD-43, SD-45

**Objective:** The PDF's headline provider for B-03 is Google reCAPTCHA; Turnstile and hCaptcha are explicitly allowed alternatives. The student confirmed that Turnstile is acceptable, so this adapter is not needed unless the requirement changes; it would give the literal product without touching the forms.

**Implementation checklist**

- `recaptcha.ts` adapter and a Google script loader in the widget, implemented against the current Google reCAPTCHA documentation (keys are managed in Google Cloud since 2025; check whether the classic `siteverify` flow or an Enterprise assessment applies to the project created).
- Same checks: action, hostname, token age, timeout, fail closed. Add the Google origins to the SPA CSP notes.

**Acceptance criteria**

- [ ] Switching `CAPTCHA_PASSWORD_CHANGE_PROVIDER=recaptcha` makes the password-change forms work with stubbed verification in tests.
- [ ] The adapter passes the shared adapter contract test suite used by Turnstile.
- [ ] A wrong action, wrong hostname, expired token and provider timeout are each rejected, and a timeout fails closed with `503`.

### SD-51 / Task 9.9 — Password-change CAPTCHA outage fallback (optional)

**Priority:** P2 · **Size:** M · **Labels:** [OPTIONAL], backend, frontend · **Depends on:** SD-44, SD-48, SD-49

**Objective:** Fail-closed means a Cloudflare outage blocks every password change (login is unaffected, its challenge is generated locally). After repeated provider errors the server may serve the internal challenge for that form, with an event and a bounded duration, which turns control question 1 into a demonstrated trade-off.

**Implementation checklist**

- Circuit breaker around the Turnstile adapter (for example 5 consecutive `UNAVAILABLE` results open it for 5 minutes); `GET /api/captcha/config?purpose=change-password` then reports `provider: 'internal'`; emit `CAPTCHA_PROVIDER_ERROR`.
- Off by default, enabled by `CAPTCHA_FALLBACK=internal`.

**Acceptance criteria**

- [ ] A simulated outage switches the password-change config to `internal` after the threshold and back after the cool-down (fake clock).
- [ ] Without the flag the behaviour stays strictly fail-closed.
- [ ] Login is unaffected during the simulated outage (its challenge is generated locally) and a `CAPTCHA_PROVIDER_ERROR` event is recorded once per outage.

---

## EPIC 10 — Bot traps and honeytokens

### SD-52 / Task 10.1 — Honeypot field in the login form (B-04)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-04, backend, frontend, security · **Depends on:** SD-37

**Objective:** Catch form-filling bots with a field no human sees. The reaction must not tell the bot it was caught and must not harm real accounts.

**Implementation checklist**

- Frontend `login.component.html`: a wrapper `div` (`aria-hidden="true"`) containing a text input `name="website"`, `tabindex="-1"`, `autocomplete="off"`, positioned off-screen with CSS (not `display:none`, not `type="hidden"`); excluded from the visible tab order and screen readers; value sent as `website` in the login body.
- Backend `honeypot` stage: a non-empty `website` yields the generic `401 AUTH_INVALID_CREDENTIALS` after one dummy hash verification, an IP-level failed attempt and an aggregated `HONEYPOT_TRIGGERED` event; account counters and CAPTCHA are not consulted.
- Optional timing trap: `formToken` from the CAPTCHA config endpoint (HMAC-signed issue time); a submission faster than 1.5 seconds counts like a filled honeypot.
- Test with Chrome, Firefox and Safari autofill and a password manager; record results and pick the field name accordingly (`docs/architecture.md`).

**Acceptance criteria**

- [ ] A request with `website: "x"` receives a response byte-identical to a wrong-password `401`, creates an event and an IP strike, and does not increment any account counter (SEC-49).
- [ ] An empty or absent `website` does not trigger; a manual autofill pass raises no false positive (SEC-50).
- [ ] The hidden input is not reachable by keyboard and not announced by the accessibility tree (component test).
- [ ] Minimum 80% test coverage for this module.

### SD-53 / Task 10.2 — Honeytoken registry, trigger service and Canarytokens client

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] B-05, backend, security · **Depends on:** SD-33, SD-35

**Objective:** One service that every honeytoken goes through: record, alert, deduplicate, never block the request, never leak anything to the third party.

**Implementation checklist**

- `server/security/honeytokens.ts`: `triggerHoneytoken({ tokenId, source, ctx })` creates a `CRITICAL` event, updates `last_triggered_at`/`trigger_count`, then dispatches.
- `CanarytokensDispatcher` (an `AlertDispatcher` from SD-35): `GET` to the Canarytokens web-bug URL read from the env var named in `honeytokens.alert_url_env`, `AbortSignal.timeout(3000)`, one retry with jitter; the request carries only an event id and the token label (for example in the `User-Agent`); never attacker input, never a password. Check what the received alert actually shows and record it in the runbook.
- Deduplicate external alerts: at most one per (token, ip_key) per 5 minutes; events are always stored; `alert_status = SUPPRESSED` for the rest.
- `CANARY_ALERTS_ENABLED=false` disables the external call (tests, offline development).
- Seed helper `seedHoneytokens()` used by SD-54 and SD-55.

**Acceptance criteria**

- [ ] A trigger writes the event and calls the stubbed Canarytokens URL exactly once; a second trigger within 5 minutes from the same address writes an event and no second call (SEC-51).
- [ ] A hanging or failing Canarytokens endpoint does not delay or fail the triggering request and sets `alert_status = FAILED` (SEC-54).
- [ ] The outgoing request contains no login, password, IP or header from the attacker (assertion on the stub).
- [ ] The Canarytokens URL is read from the environment only; a repository scan finds no `canarytokens` URL (CI check).
- [ ] Minimum 80% test coverage for this module.

### SD-54 / Task 10.3 — Account-trap honeytoken (B-05, token 1)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-05, backend, security · **Depends on:** SD-37, SD-53

**Objective:** The trap account whose use triggers an alert. It has no user row, so there is nothing to compromise, and it behaves exactly like an unknown login to the outside.

**Implementation checklist**

- Seed a `honeytokens` row `account-trap-backup-admin` (kind `ACCOUNT_TRAP`, login `backup_admin`, alert URL env `CANARY_ACCOUNT_TRAP_URL`).
- Pipeline `honeytoken` stage after CAPTCHA: when the normalized login matches an enabled trap, call `triggerHoneytoken` and then **continue** on the normal unknown-login path (same dummy hash verification, same lock and IP counting, same `401`), so it is indistinguishable and the trap logs every attempt.
- Reserve the login: user creation (`user-service.ts`/`schemas.ts`) rejects a login that equals a registered trap with a validation error; the seed and `reset-db` handle the new table.
- Create the matching web-bug token at canarytokens.org (SD-56) and store its URL in `.env`.

**Acceptance criteria**

- [ ] A login attempt as `backup_admin` with any password returns the exact `401` body of an unknown login, takes the same single verification, and raises one `CRITICAL` event and one external alert call (SEC-51).
- [ ] Response bodies and headers for `backup_admin` and for a random unknown login are byte-identical (SEC-34 extension).
- [ ] An administrator cannot create a user named `backup_admin`; the check is case-insensitive.
- [ ] The trap login appears in no user list, count or seed credentials file.
- [ ] Minimum 80% test coverage for this module.

### SD-55 / Task 10.4 — Decoy resource honeytoken: AWS keys (B-05, token 2)

**Priority:** P0 · **Size:** M · **Labels:** [ASSIGNMENT] B-05, backend, security · **Depends on:** SD-53, SD-54

**Objective:** A second honeytoken of a different type, chosen from the PDF's list; the student chose AWS keys. An attacker who finds "backup credentials" and tries them triggers an alert from outside our system.

**Implementation checklist**

- `GET /api/backup/config` (`defineRoute`, `auth: 'public'`, added to the conformance allowlist and documented as a decoy): returns a believable JSON object (host names, a `backup_admin` login as bait for token 1, and `aws_access_key_id`/`aws_secret_access_key` from `CANARY_DECOY_AWS_*`), always `Cache-Control: no-store`.
- Any request records `DECOY_RESOURCE_ACCESSED` (CRITICAL, aggregated per address) via `triggerHoneytoken` and returns the decoy whether or not the keys are configured (placeholder text when unset).
- Lure: `apps/frontend/public/robots.txt` with `Disallow: /api/backup/` so scrapers and curious people find it.
- Seed a `honeytokens` row `decoy-aws-keys` (kind `AWS_KEYS`).
- The keys are created by hand at canarytokens.org (AWS keys token) and live only in `.env`; **never commit them** (repository secret scanners harvest committed AWS keys).

**Acceptance criteria**

- [ ] A request to the decoy returns `200` with the decoy shape, raises one event, and (with the stub) one external alert; real secrets never appear in it (SEC-53).
- [ ] With the env vars unset the route still works and leaks nothing real.
- [ ] `robots.txt` is served by the Angular app and lists the disallowed path.
- [ ] A repository scan finds no AWS-key-looking string (CI check on `AKIA…` patterns).
- [ ] Minimum 80% test coverage for this module.

### SD-56 / Task 10.5 — Canarytokens setup runbook and alert verification

**Priority:** P0 · **Size:** S · **Labels:** [ASSIGNMENT] B-05, documentation, security · **Depends on:** SD-54, SD-55

**Objective:** The tokens are created by hand on a third-party service, and the report needs screenshots of the alerts. A runbook makes this reproducible and keeps secrets out of the repository.

**Implementation checklist**

- `docs/canarytokens.md`: create a "Web bug" token for the account trap and an "AWS keys" token for the decoy at canarytokens.org (check at the time which token types the free hosted service offers and adjust, for example to a DNS token); fill `.env`; trigger each one; expected delay for AWS-sourced alerts (about 2 to 30 minutes); how to read the alert e-mail; how to disable or rotate a token.
- Evidence checklist for the report: trigger by running the bot script's trap scenario, by fetching the decoy, and by using the AWS keys against the AWS API from a throwaway shell; save redacted screenshots of both alert e-mails in `docs/report-evidence/module-2/`.
- Record what each alert actually contains so the report is accurate.

**Acceptance criteria**

- [ ] A person other than the author follows `docs/canarytokens.md` and receives both alerts.
- [ ] The runbook contains no real token URL or key; the evidence screenshots mask them.
- [ ] Two tokens of different types (web bug and AWS keys, or the chosen alternative) are documented as deployed.

### SD-57 / Task 10.6 — Direct alert channel (optional)

**Priority:** P2 · **Size:** M · **Labels:** [OPTIONAL], backend · **Depends on:** SD-35, SD-53

**Objective:** Do not rely on a third party to notify the administrator. A second `AlertDispatcher` for SMTP or a chat webhook sends `CRITICAL` events from our own code.

**Implementation checklist**

- A dispatcher selected by env (`ALERT_WEBHOOK_URL` or SMTP settings), payload with event type, time, severity and event id only; same timeout, dedupe and failure handling as SD-53.
- Off by default; never includes request content.

**Acceptance criteria**

- [ ] With the dispatcher enabled a `CRITICAL` event produces exactly one message to a stub endpoint.
- [ ] A failing or hanging endpoint sets `alert_status = FAILED` without delaying or failing the triggering request.
- [ ] The message body contains only event type, time, severity and event id; a payload scan finds no login, address, password or token.

---

## EPIC 11 — Security visibility (administrator)

### SD-58 / Task 11.1 — Security events admin API

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], admin, backend · **Depends on:** SD-33, SD-35

**Objective:** Make the recorded events readable by the administrator and only by them.

**Implementation checklist**

- `GET /api/admin/security-events` (`security-events:read`): strict query (`type`, `severity`, `acknowledged`, `from`, `to`, `page`, `pageSize` ≤ 100), explicit DTO mapper (no raw rows), newest first.
- `POST /api/admin/security-events/[id]/acknowledge` (`security-events:acknowledge`), idempotent.
- Serialization guard test: no event DTO contains password/token/secret-like keys.

**Acceptance criteria**

- [ ] Administrator lists and filters; other roles get `403`, anonymous `401` (SEC-58).
- [ ] Unacknowledged `CRITICAL` count is available for the banner (`total` with `severity=CRITICAL&acknowledged=false&pageSize=1`).
- [ ] Acknowledging twice is idempotent, records who acknowledged and when, and never changes the stored `details`.
- [ ] No response contains a key or value that looks like a password, token, secret or CAPTCHA answer (serialization guard).
- [ ] Minimum 80% test coverage for this module.

### SD-59 / Task 11.2 — Security events UI and critical alert banner

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], admin, frontend · **Depends on:** SD-58

**Objective:** Alerts need a place to be seen in the application itself, and the report needs screenshots.

**Implementation checklist**

- `features/admin-security-events/` list component with filters, severity badges, acknowledge action, empty and error states; route `/admin/security-events` guarded by `security-events:read`; nav item; `admin-api.service.ts` methods.
- A banner in `shared/layout/app-shell.component.ts` for administrators with unacknowledged `CRITICAL` events, loaded once per navigation (not polled) so it does not keep a session alive.

**Acceptance criteria**

- [ ] The administrator sees events and acknowledges one; non-admin roles see no nav entry and are redirected from the route.
- [ ] After a trap trigger the banner appears on the next navigation and disappears after acknowledgement.
- [ ] The banner is fetched once per navigation, not polled (a test asserts there is no repeating request), so it never extends a session.
- [ ] Loading, empty and error states render, and the filters are reflected in the request parameters.
- [ ] Minimum 80% test coverage for this module.

### SD-60 / Task 11.3 — Honeytoken status panel and test alert

**Priority:** P1 · **Size:** S · **Labels:** [DESIGN], admin, backend, frontend · **Depends on:** SD-53, SD-59

**Objective:** Let the administrator confirm the alert path works without attacking their own application.

**Implementation checklist**

- `GET /api/admin/honeytokens` (`honeytokens:read`): id, kind, label, enabled, last triggered, count; never URLs or keys.
- `POST /api/admin/honeytokens/[id]/test` (`honeytokens:test`): sends a marked test alert and writes an `INFO` event.
- Panel on the security events page.

**Acceptance criteria**

- [ ] The list shows no secret; the test action creates a labelled test event and one external call (stub).
- [ ] The test alert is labelled as a test in the event and in the outgoing request and does not change `trigger_count`.
- [ ] No response contains an alert URL, a key or an environment variable value (serialization guard).
- [ ] Other roles get `403`.

---

## EPIC 12 — Verification and submission

### SD-61 / Task 12.1 — Bot simulation script (B-06)

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT] B-06, testing, security · **Depends on:** SD-38, SD-46, SD-47, SD-48, SD-52, SD-54. SD-40 for the IP scenarios

**Objective:** A script that behaves like a bot against the own application and prints which protection stopped which attack. It is the evidence for the "test" requirement and must be unable to hit anything but the own application.

**Implementation checklist**

- `scripts/bot-sim/bot-sim.ts` (run with `node --experimental-strip-types`, like the other scripts; npm script `bot-sim`), plain `fetch`, sets the required `Origin` header and JSON content type.
- Guard rails: refuse any target host other than `localhost`, `127.0.0.1`, `::1` or `*.localhost` unless `--allow-host` and `BOTSIM_I_OWN_THE_TARGET=1` are both given; print the legal disclaimer; cap requests per second and total requests.
- Scenarios, each reporting observed status codes and the protection that reacted: (1) naive brute force with no CAPTCHA; (2) brute force with a CAPTCHA-solving service simulated by the internal provider's test mode (`TEST-SOLVED`, still single-use and time-limited), which shows the lock is the second layer; (3) credential stuffing from a fixture list of fake `login:password` pairs; (4) password spraying: one common password against every seeded login; (5) honeypot-filling form bot; (6) trap-account probing (`backup_admin`); (7) CAPTCHA replay (a spent internal challenge at login; for Turnstile the "duplicate" test secret on the password-change endpoint); (8) `X-Forwarded-For` rotation to evade the IP limit; (9) decoy fetch.
- Between scenarios it resets abuse state by writing to the isolated E2E SQLite file directly (no test-only HTTP endpoints exist) and reads `security_events` for the summary.
- Output: a console table and `output/bot-sim-report.json`, plus a Markdown summary for the report: scenario × protection (CAPTCHA, account lock, IP block, honeypot, honeytoken) with "stopped / not stopped" and the HTTP evidence.

**Acceptance criteria**

- [ ] Running against the E2E app produces the matrix; every scenario is stopped by at least one layer, and the summary names which one (SEC-31, SEC-40, SEC-49, SEC-51, SEC-55).
- [ ] `--target https://example.com` is refused without both explicit consents (SEC-61).
- [ ] The run is repeatable: two consecutive runs give the same matrix.
- [ ] The script uses no real credentials; fixtures are clearly fake.
- [ ] Minimum 80% test coverage for this module (guards, scenario runner and report builder have unit tests; the network part is covered by the E2E run).

### SD-62 / Task 12.2 — Unit and integration tests for Module 2

**Priority:** P0 · **Size:** XL · **Labels:** [ASSIGNMENT], testing, security · **Depends on:** every feature it tests: SD-36 to SD-39, SD-43 to SD-49 and SD-52 to SD-55 (P0), plus whichever of SD-40 to SD-42 and SD-58 to SD-60 are built

**Objective:** Prove every rule with fast, deterministic tests and keep the existing SEC traceability mechanism working for SEC-31 to SEC-62.

**Implementation checklist**

- Backend tests next to the code and integration tests under `tests/integration/` using the existing temp-database helpers and fake clock; CAPTCHA siteverify stubbed with `vi.stubGlobal('fetch', …)`.
- Cover each scenario of section 9; table-driven lockout boundaries; the parallel-burst test with `Promise.all`; restart test by reopening the database and re-importing modules.
- Add SEC-31 to SEC-62 to `docs/testing.md` with their proof; every test title that proves one contains its id so `scripts/check-sec-traceability.ts` passes.
- Update `tests/route-guard-conformance.test.ts` allowlist (three new public routes) and `tests/admin-routes-authz.test.ts` for the new admin routes across four roles.
- Static checks: no `AKIA…`-style key and no Canarytokens URL in the repository; no secret-looking keys in event details.
- Frontend component specs for the CAPTCHA components, countdown, honeypot and admin views.

**Acceptance criteria**

- [ ] `npm test` is green and the combined coverage gate (80% statements, branches, functions and lines) still holds.
- [ ] `check-sec-traceability` reports every SEC-31…SEC-62 as covered.
- [ ] Mutation sanity check recorded in `docs/testing.md`: changing `>=` to `>` in the lock count, removing the CAPTCHA stage, or making the honeypot compare case-sensitive each fails at least one test.
- [ ] No test sleeps in real time; no test touches the development database.

### SD-63 / Task 12.3 — E2E tests and report evidence

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT], testing, documentation · **Depends on:** SD-39, SD-46, SD-47, SD-52, SD-56, SD-59, SD-61

**Objective:** Prove the journeys in a real browser and produce the screenshots the PDF requires, in a way that does not depend on Cloudflare being reachable during automated runs.

**Implementation checklist**

- New specs in `tests/e2e/`: `lockout.spec.ts` (N failures, countdown on screen, unlock by admin), `captcha-login.spec.ts`, `captcha-password-change.spec.ts` (including a forged-token request that gets `403`), `honeypot.spec.ts`, `honeytoken.spec.ts`, `bot-sim.spec.ts` (runs the script and checks the matrix).
- Hermetic mode: login uses the internal provider with `CAPTCHA_TEST_MODE=true` (the spec types `TEST-SOLVED`); for the password-change forms Playwright serves a stub for the Turnstile `api.js` through `page.route` and the backend uses `TURNSTILE_VERIFY_URL` pointing to a local stub, so CI never calls Cloudflare. A separate, manually run "live" pass (real challenge image at login, Cloudflare's dummy keys and one pass with real keys for Turnstile) captures the evidence screenshots.
- Evidence in `docs/report-evidence/module-2/` (keep `scripts/check-image-locations.ts` green): `m2-01-account-lockout.png`, `m2-02-login-captcha.png`, `m2-03-password-change-captcha.png`, `m2-04-request-without-token-rejected.png`, `m2-05-canarytoken-account-trap-alert.png`, `m2-06-canarytoken-aws-alert.png`, `m2-07-bot-simulation-result.png`, `m2-08-security-events.png`; update `docs/report-evidence/README.md` with the scenario to file map.
- Mask secrets with Playwright's `mask` option; no cookie or token in any image.

**Acceptance criteria**

- [ ] The Module 2 specs pass three consecutive runs with retries disabled (the project's determinism rule).
- [ ] All eight screenshots exist, show the real state and contain no reusable secret.
- [ ] The rejected-request screenshot shows an API response with status `400` or `403` and the CAPTCHA error code, not a UI-only message.
- [ ] Minimum 80% test coverage for this module (every journey in section 11 has a spec).

### SD-64 / Task 12.4 — Documentation, threat model and Module 2 report

**Priority:** P0 · **Size:** L · **Labels:** [ASSIGNMENT], documentation · **Depends on:** all P0 items, SD-61, SD-63

**Objective:** Finish the repository documentation and produce the PDF report required by section 5 of the PDF. A reviewer must be able to reproduce the demo from the README.

**Implementation checklist**

- Update `README.md` (new env vars, CAPTCHA modes, how to run the bot script, how to create the Canarytokens), `docs/architecture.md` (pipeline, lockout algorithm, CAPTCHA rules, client IP, honeytokens, events and retention), `docs/database-schema.md`, `docs/permissions.md`, `docs/threat-model.md` (section 12), `docs/testing.md`.
- Write the report in Polish like Module 1 (`docs/course/report-module-2.md`, built to PDF with the existing `scripts/build-report.py`): title page, theory in own words (brute force, credential stuffing, password spraying, layered defence, CAPTCHA limits including accessibility, honeytokens), exercises (variant number, how CAPTCHA and the attempt limit work, how the token is verified, deployed tokens, key code), screenshots with a paragraph each, the four control answers (hints in section 14), conclusions with honest limitations, repository link.
- State every deviation and decision (provider choice, phantom locks, per-IP trade-offs, fail-closed, own CAPTCHA strength).

**Acceptance criteria**

- [ ] A person who has not seen the project follows the README and reproduces the lockout, both CAPTCHAs, the honeypot, a trap alert and the bot script result.
- [ ] The report contains every element of PDF section 5, the variant number, all six required screenshot kinds and all four control answers in full paragraphs.
- [ ] No credential, key, token or Canarytokens URL appears in the report, screenshots or docs (secret scan passes).
- [ ] The PDF is exported and the repository link is included.

---

## 9. Security acceptance test matrix

IDs continue Module 1's sequence so `docs/testing.md` and `scripts/check-sec-traceability.ts` work unchanged.

| ID     | Scenario                                                                              | Expected outcome                                                           | Evidence                           |
| ------ | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| SEC-31 | N-th failed login for one login (N = 5)                                               | `429 AUTH_ACCOUNT_LOCKED` with `lockedUntil` and `retryAfterSeconds` ≈ 900 | API test + UI screenshot           |
| SEC-32 | Attempt at +14 min 59 s and +15 min                                                   | Still locked, then accepted                                                | Fake-clock test                    |
| SEC-33 | Correct password during the lock                                                      | Refused; lock end unchanged                                                | API test                           |
| SEC-34 | Existing vs non-existing vs trap login, same sequence                                 | Identical status, code, `details` shape and `401` bodies                   | API test                           |
| SEC-35 | Successful login after failures                                                       | Counter reset                                                              | API test                           |
| SEC-36 | 50 parallel wrong attempts                                                            | At most N credential verifications                                         | Concurrency test                   |
| SEC-37 | Change N, send invalid N                                                              | New N applies at once; 2 and 21 rejected                                   | API test                           |
| SEC-38 | Admin unlocks; non-admin tries                                                        | Login possible at once; `403` for others; event written                    | API test                           |
| SEC-39 | Lock vs administrative block                                                          | The two states are independent                                             | API test                           |
| SEC-40 | Login without CAPTCHA                                                                 | `400 CAPTCHA_REQUIRED`; no credential check, no lock counting              | API test with spies                |
| SEC-41 | Wrong, expired or already used CAPTCHA challenge at login                             | `403 CAPTCHA_FAILED`; counted against the IP                               | Integration test                   |
| SEC-42 | Turnstile: wrong action, wrong hostname, token older than 120 s                       | Rejected                                                                   | Stubbed-provider test              |
| SEC-43 | Turnstile timeout / 5xx on a password change                                          | `503 CAPTCHA_UNAVAILABLE`, fail closed                                     | Stubbed-provider test              |
| SEC-44 | Password change without or with forged token                                          | Rejected; stored hash and history unchanged                                | API test + screenshot              |
| SEC-45 | Valid token succeeds once; same token reused                                          | Second change rejected                                                     | API test                           |
| SEC-46 | Internal challenge answered twice / wrong first answer                                | Single attempt per challenge                                               | API test                           |
| SEC-47 | Internal challenge at +119 s and +121 s                                               | Pass, then fail                                                            | Fake-clock test                    |
| SEC-48 | Internal answer in original vs reversed order; inspect response                       | Reversed passes; no plaintext or `<text>` in the response                  | API test                           |
| SEC-49 | Honeypot filled                                                                       | Generic `401`, event, IP strike, account counter unchanged                 | API test                           |
| SEC-50 | Honeypot empty or absent; autofill pass                                               | No false positive                                                          | API + manual check                 |
| SEC-51 | Trap login attempt                                                                    | `CRITICAL` event, one deduplicated external alert, indistinguishable `401` | API test + alert e-mail screenshot |
| SEC-52 | Create a user named like the trap                                                     | Rejected, case-insensitive                                                 | API test                           |
| SEC-53 | Fetch the decoy resource                                                              | `CRITICAL` event, no real secret in the body                               | API test + alert screenshot        |
| SEC-54 | Canarytokens down or slow                                                             | Request unaffected; `alert_status = FAILED`                                | Stubbed-dispatcher test            |
| SEC-55 | L + 1 failures from one IP across different logins                                    | `429 AUTH_IP_BLOCKED`; other IP unaffected                                 | API test                           |
| SEC-56 | Rotating forged `X-Forwarded-For`                                                     | Same effective address; limit holds                                        | API test                           |
| SEC-57 | Failures against K distinct logins from one IP                                        | One spraying event per bucket                                              | API test                           |
| SEC-58 | Security events API: roles, filters, redaction                                        | Admin only; no secret-like fields                                          | API test                           |
| SEC-59 | Restart the backend while locked / IP-blocked                                         | State persists                                                             | Integration test                   |
| SEC-60 | N wrong current passwords on change-password                                          | Sessions revoked; refusal for 15 minutes                                   | API test                           |
| SEC-61 | Bot script with a non-local target                                                    | Refused without both consents                                              | Script test                        |
| SEC-62 | Production start-up with Cloudflare dummy keys, `CAPTCHA_TEST_MODE` or test overrides | Process refuses to start                                                   | Config test                        |

---

## 10. Recommended implementation order and dependencies

Vertical slices again (schema, API, UI, tests per slice):

- **Milestone M7 — Foundation:** SD-33, SD-34, SD-35, SD-36. Outcome: tables, trusted IP, event service and the new settings exist.
- **Milestone M8 — Lockout slice (B-01):** SD-37, SD-38, SD-39. Outcome: N failures lock a login for 15 minutes and the login screen counts down.
- **Milestone M9 — CAPTCHA slice (B-02, B-03):** SD-43, SD-45, SD-48, SD-49, SD-46, SD-44, SD-47. Outcome: login requires the variant-2 challenge and both password-change forms require a verified Turnstile token.
- **Milestone M10 — Traps (B-04, B-05):** SD-52, SD-53, SD-54, SD-55, SD-56. Outcome: honeypot, trap account, decoy AWS-key token and a documented alert path.
- **Milestone M11 — Extras and visibility:** SD-40 (extra task), SD-41, SD-42, SD-58, SD-59, SD-60. Outcome: IP limit, admin tooling, event view.
- **Milestone M12 — Verification and submission (B-06):** SD-61, SD-62, SD-63, SD-64. Optional after that: SD-50, SD-51, SD-57.

```
SD-33 ─┬─▶ SD-35 ─┬─▶ SD-37 ─┬─▶ SD-38 ─▶ SD-39
SD-34 ─┤          │          ├─▶ SD-40 (extra) ─▶ SD-41
SD-36 ─┘          │          ├─▶ SD-46 ◀─ SD-49 ◀─ SD-48 ◀─ SD-43 ◀─ (SD-33, SD-34)
                  │          │            ▲
                  │          │          SD-45 ─▶ SD-47 ◀─ SD-44 ◀─ SD-43
                  │          ├─▶ SD-52 (honeypot)
                  └─▶ SD-53 ─┴─▶ SD-54 ─▶ SD-55 ─▶ SD-56
SD-45 ─▶ SD-49 (variant 2)          SD-35 ─▶ SD-58 ─▶ SD-59 ─▶ SD-60
all P0 ─▶ SD-61 ─▶ SD-62 ─▶ SD-63 ─▶ SD-64
```

---

## 11. UI and user journeys

### 11.1 Page inventory changes

| Route / element                                        | Change                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `/login`                                               | CAPTCHA widget, hidden honeypot, lockout/IP-block countdown        |
| `/change-initial-password`, `/account/change-password` | CAPTCHA widget                                                     |
| `/admin/security`                                      | "Login protection" settings group                                  |
| `/admin/security-events` (new)                         | Event list, filters, acknowledge, honeytoken panel, address blocks |
| `/admin/users`, `/admin/users/:id`                     | Locked badge, unlock action                                        |
| App shell                                              | Critical-alert banner for administrators                           |

### 11.2 Journey: a bot tries to guess a password

1. The bot posts credentials without a CAPTCHA token and gets `400`; nothing about any account is revealed.
2. With a solved token (bought from a solving service) it keeps guessing `employee1`; the fifth failure returns `429` with 15 minutes remaining; further guesses, even the correct password, are refused without a verification.
3. It switches to many logins from one address; at the configured limit the address is blocked.
4. It tries `backup_admin` found in a scraped file; the response looks like any unknown login, while the administrator sees a `CRITICAL` event and the Canarytokens e-mail arrives.

### 11.3 Journey: an honest user mistypes

1. The user fails twice, then logs in correctly: the counter resets, no lock, no event.
2. After five failures the user sees "Too many failed attempts. Try again in 14:32." and the button is disabled until the countdown ends, or the administrator unlocks the account.

### 11.4 Journey: password change with CAPTCHA

The user opens the change form, the widget issues a token, the form submits with it; a replay of the same request returns `403`, a request without a token returns `400`, and neither alters the stored password.

---

## 12. Threat model additions

| Threat                           | Risk                                           | Planned control                                                        | Test                                |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| Brute force on one account       | Online password guessing                       | Persistent lock after N failures, reserve-then-verify                  | SEC-31, SEC-36                      |
| Credential stuffing              | Leaked pairs from other sites                  | CAPTCHA, per-IP limit, trap account, Argon2 cost                       | SEC-40, SEC-55                      |
| Password spraying                | One password against many accounts             | Per-IP failed-attempt limit, distinct-login detection                  | SEC-55, SEC-57                      |
| Account lockout abuse (DoS)      | Attacker locks a victim or `ADMIN`             | CAPTCHA first, IP limits, admin and CLI unlock, event                  | SEC-33, SEC-38                      |
| Account enumeration via lock     | Lock reveals the login exists                  | Phantom locks for unknown logins, identical shape                      | SEC-34                              |
| CAPTCHA bypass                   | Missing token, replay, token from another form | Server-side verify, single use, age limit, action and hostname binding | SEC-40 to SEC-45                    |
| CAPTCHA farm / AI solver         | Humans or models solve at scale                | Accepted residual risk; lock and IP limit are the second layer         | Bot script scenario 2               |
| Provider outage or compromise    | Login unavailable, or tokens untrusted         | Fail closed, optional fallback, short timeouts                         | SEC-43                              |
| Dummy keys in production         | Every token verifies                           | Start-up refuses them                                                  | SEC-62                              |
| Honeypot evasion                 | Bot skips the hidden field                     | CAPTCHA and limits behind it                                           | Bot script scenario 5               |
| Honeypot false positive          | Autofill fills the field                       | Obscure name, `autocomplete="off"`, manual check                       | SEC-50                              |
| Header spoofing                  | Fake `X-Forwarded-For` evades IP limits        | Trusted-hop parsing, proxy overwrite rule                              | SEC-56                              |
| Trap detection by attacker       | Attacker notices the trap differs              | Trap login follows the unknown-login path exactly                      | SEC-34, SEC-51                      |
| Alert flooding                   | Attacker triggers thousands of alerts          | Aggregation, dedupe, row caps, retention                               | SEC-54                              |
| Alert leaks data                 | Attacker input sent to a third party           | Only event id and label are sent                                       | SEC-51                              |
| Canary secrets in the repository | Keys harvested by scanners                     | Environment only, CI scan                                              | Static check                        |
| Event table abuse                | Attacker fills storage                         | Aggregation, purge job, IP limit                                       | Aggregation and purge tests (SD-35) |
| Privacy of logs                  | IP and user agent are personal data            | Retention horizon, minimal fields, documented                          | Review                              |

Residual risks to state in the report: a single-process SQLite deployment, shared-NAT over-blocking, the weakness of a text/image CAPTCHA that we generate ourselves, and the privacy cost of sending visitor signals to a CAPTCHA provider.

---

## 13. Definition of Done

A backlog item is done only when: it meets its acceptance criteria; the backend enforces the rule independently of Angular; input is validated server-side with strict schemas; no password, token, CAPTCHA response or secret is logged, stored in an event or returned; positive and negative automated tests exist and pass; new routes and permission codes are documented and on the right allowlist; schema changes have migrations that keep existing data; failures are consistent and leak no internals; the feature runs from a fresh clone via the README; and report evidence exists where the PDF requires it.

### 13.1 Definition of Done for the entire Module 2

- The administrator can set the failed-attempt limit; the Nth failure locks the login for 15 minutes; the login screen shows the remaining time; the state is persistent and does not reveal which accounts exist.
- Login and both password-change forms require a server-verified, one-time, time-limited CAPTCHA proof; a form without a valid token is rejected.
- A hidden honeypot field marks form-filling bots silently.
- At least two honeytokens of different types are deployed, one of them a trap account whose use raises an alert; alerts are received and shown in the report.
- A bot script exists, refuses non-local targets, and produces the per-protection summary.
- The per-IP limit extra task is implemented, or consciously dropped and recorded.
- All tests are green with the 80% coverage gate and SEC-31 to SEC-62 traceability.
- The Module 2 report, screenshots and repository link are complete.

---

## 14. Reporting checklist mapped to the PDF

| PDF requirement                        | Deliverable         | Evidence                                                                                                       |
| -------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------- |
| Title page                             | Report front matter | Name, group, index, module, course                                                                             |
| Theoretical introduction               | Report section 1    | Brute force, stuffing, spraying, layered defence, CAPTCHA limits, honeytokens, own words                       |
| Variant, CAPTCHA and limit description | Report section 2    | Provider choice, variant 2 note, lockout algorithm                                                             |
| How reCAPTCHA/Turnstile is verified    | Report section 2    | Server-side siteverify, action/hostname/age checks                                                             |
| Deployed tokens                        | Report section 2    | Web-bug trap and AWS-key decoy, how they are wired                                                             |
| Code excerpts                          | Report section 2    | Attempt tracker, pipeline, Turnstile adapter, trigger service                                                  |
| Screenshots                            | Report section 3    | Account lock, login CAPTCHA, password-change CAPTCHA, rejected request, Canarytokens alerts, bot script result |
| Control questions                      | Report section 4    | See hints below                                                                                                |
| Conclusions                            | Report section 5    | Results, limits, future work                                                                                   |
| Repository link or archive             | Appendix            | URL                                                                                                            |

### Hints for the control questions

1. **Own bot protection vs ready solutions.** Detection quality depends on huge, continuously updated signal sets (device and behaviour telemetry, global attack data) that a single application cannot have; solving techniques and AI evolve, so a home-made challenge is quickly obsolete; maintenance and security of the mechanism become your burden. Drawbacks of a provider: availability and fail-closed outages, privacy and GDPR data transfer, vendor lock-in and pricing changes, accessibility depending on the vendor, trust in a third party, extra latency and CSP surface.
2. **Stuffing vs spraying.** Credential stuffing replays _pairs_ leaked from other services (many accounts, each tried with its own leaked password, typically one or two attempts per account), exploiting password reuse. Password spraying tries _one or a few popular passwords across many accounts_, staying under per-account lockout thresholds. Hence per-account lockout stops brute force but not spraying, and per-IP limits plus detection of many distinct logins are needed.
3. **Danger of lockout.** It turns the defence into a denial-of-service tool: an attacker can lock chosen users (or the only administrator) on purpose. Mitigations: CAPTCHA before counting, IP limits, short lock, unlock procedure, alerts, avoiding account enumeration through different lock behaviour.
4. **Honeytoken false positives.** No legitimate user, process or document ever touches it, so any access is by definition unauthorized; there is no baseline of normal use to confuse with an attack. Residual false positives come only from internal scans or backups that read everything, which can be excluded.

---

## 15. Decisions, assumptions and open points

| ID   | Topic                         | Decision                                                                                                                                                  | Status                                                                                                           |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D-01 | Login CAPTCHA                 | Own variant 2 (reversed string) at login, P0; Cloudflare Turnstile at password change, P0; one provider interface, provider chosen per form by the server | [DESIGN], confirmed by the student: variant No. 2 is applied in every module                                     |
| D-02 | Provider choice               | Turnstile: free, no Google Cloud project or billing, official dummy keys for tests, accessibility features                                                | [DESIGN]. reCAPTCHA adapter is P2 (SD-50)                                                                        |
| D-03 | Lock keyed by submitted login | Existing and non-existing logins lock identically ("phantom locks")                                                                                       | [DESIGN]. Needed to satisfy "show remaining time" without breaking Module 1's no-enumeration rule                |
| D-04 | Lock vs block                 | Temporary lockout is separate from `users.is_blocked`                                                                                                     | [DESIGN]                                                                                                         |
| D-05 | Window and lock duration      | Both fixed at 15 minutes; only N and IP thresholds are configurable                                                                                       | [ASSIGNMENT] fixes 15 minutes; the window is a design choice                                                     |
| D-06 | CAPTCHA before account logic  | CAPTCHA failures never count against an account, only against the IP                                                                                      | [DESIGN]                                                                                                         |
| D-07 | Fail closed                   | No login or password change without a verified CAPTCHA, even if a provider is down                                                                        | [DESIGN]. Fallback for the password change is optional (SD-51)                                                   |
| D-08 | Trap account                  | No user row; behaves as an unknown login; alert through events and a Canarytokens web-bug URL                                                             | [DESIGN]. Canarytokens has no "application account" token, the trap is ours and Canarytokens delivers the e-mail |
| D-09 | Second token                  | AWS keys in a decoy resource                                                                                                                              | [DESIGN], chosen by the student                                                                                  |
| D-10 | Error text language           | API messages Polish, UI English, as in Module 1                                                                                                           | Consistency with the existing code                                                                               |
| D-11 | Persistence                   | SQLite-backed attempt tracking replaces the in-memory login limiter; the TOTP and CAPTCHA endpoint limiters stay in memory                                | [DESIGN]                                                                                                         |
| D-12 | Per-IP extra task             | Treated as P1 rather than P2                                                                                                                              | [EXTRA], explained in section 0                                                                                  |

### 15.1 Open points to resolve with the lecturer or the student

- **O-01** _Resolved:_ the student's variant No. 2 is applied in every module; the login CAPTCHA is the reversed-string challenge (SD-48, SD-49, P0).
- **O-02** _Resolved:_ Cloudflare Turnstile is acceptable for the password-change CAPTCHA; SD-50 (Google reCAPTCHA) stays P2 and is not needed.
- **O-03** _Resolved:_ the second Canarytoken is AWS keys (SD-55). Their alerts arrive with a delay of roughly 2 to 30 minutes, so trigger them early when preparing the evidence.
- **O-04** Which Canarytokens token types the free hosted service offers today must be checked on canarytokens.org at the time (the documentation lists many, availability per type is not stated).
- **O-05** Whether the report should present the trap account as a "Canarytokens token" or as an application-level honeytoken wired to Canarytokens; D-08 gives both.
- **O-06** Module 3 requirements are unknown; the event model and the admin view are built to be extended, nothing more is assumed.

---

## 16. Recommended final verification sequence

1. Fresh database: `npm run db:migrate && npm run db:seed`; start both apps.
2. Log in without solving the CAPTCHA: expect `400 CAPTCHA_REQUIRED`. Solve it with a wrong password five times: expect the lock and the countdown. Check that `employee1` and a random unknown login behave identically.
3. Wait on the fake clock in tests (never in real time) for the lock to expire; unlock another account as the administrator.
4. Change the attempt limit in the admin page and confirm it applies to the next attempt.
5. Change a password with a valid token; replay the request; send it with no token and with a forged token. Check the database hash is unchanged.
6. Fill the honeypot by script; confirm the generic `401`, the event and the IP strike.
7. Try `backup_admin`; fetch `/api/backup/config`; confirm both critical events and the two alert e-mails; later use the decoy AWS keys and wait for the delayed alert.
8. Run the bot script and archive the matrix; check it refuses a non-local target.
9. Run `npm test` (SEC-31 to SEC-62 traceability and the coverage gate) and the E2E suite three times.
10. Fill the report, export the PDF, verify that no secret appears anywhere, and confirm a clean clone starts from the README.

---

## 17. References

- "Moduł 2 – Zabezpieczenia przed atakami.pdf" (3 pages): theory, tasks, variants, control questions, report structure.
- OWASP Automated Threats to Web Applications.
- Cloudflare Turnstile documentation: client-side widget, server-side validation (siteverify), testing keys, Content-Security-Policy requirements.
- Google reCAPTCHA documentation (Google Cloud).
- hCaptcha documentation.
- Canarytokens documentation (docs.canarytokens.org): HTTP (web bug), AWS API keys, DNS and other tokens.
- OWASP Authentication Cheat Sheet (account lockout, CAPTCHA, enumeration) and OWASP Credential Stuffing Prevention Cheat Sheet.
- Module 1 repository documents: `docs/architecture.md`, `docs/threat-model.md`, `docs/testing.md`, `docs/permissions.md`.
