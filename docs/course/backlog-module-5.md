# SecureDesk — Module 5 Implementation Backlog

**Theme:** Identity — passkeys, single sign-on, account recovery, device sessions and adaptive authentication
**Application:** SecureDesk — Angular SPA + Next.js API + PostgreSQL + Redis (Module 4)
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-27
**Language:** English (API error messages stay Polish and UI texts stay English, as in the existing code)
**Prerequisite:** Module 4 through SD-108 (PostgreSQL, tests on Postgres) and SD-111 (shared limiter). SD-110 and SD-112 are used by the risk engine.

---

## 0. How to use this document

This backlog continues the numbering of Module 4: **SD-124 to SD-145**, epics **25 to 28**, task IDs **Task 25.1 to Task 28.6**. Layout, provenance tags, priorities and sizes are those of `docs/course/backlog-module-4.md` (sections 0 and 1): P0 required, P1 recommended, P2 optional; sizes S, M, L, XL. One GitHub milestone covers the module.

### Requirement provenance

| Tag           | Meaning                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `[STANDARD]`  | Follows a named standard (W3C WebAuthn Level 3, OpenID Connect Core, OAuth 2.0 BCP, ASVS V2/V3) |
| `[HARDENING]` | Security measure beyond the existing controls                                                   |
| `[DESIGN]`    | Project decision to make the feature cohesive, demonstrable and extensible                      |
| `[PORTFOLIO]` | Mainly improves how the project demonstrates skills                                             |

---

## 1. Goals and scope

### 1.1 Goals

1. Offer phishing-resistant, passwordless sign-in (passkeys) next to the existing Argon2id password and TOTP.
2. Let an organisation delegate authentication to an identity provider (OpenID Connect) without weakening local rules.
3. Replace "an administrator must reset my password" with a safe self-service recovery flow, and let users see and end their own sessions.
4. Make authentication context-aware: score each login by device, place and behaviour, and step up or refuse when risk is high.

### 1.2 In scope

Epic 25 Passkeys and WebAuthn, Epic 26 OIDC single sign-on, Epic 27 Recovery and device sessions (including the mail service), Epic 28 Adaptive authentication (including the GeoIP service).

### 1.3 Out of scope

- SAML, SCIM provisioning, social logins other than generic OIDC, push-notification MFA, SMS codes (weak channel; the reasoning goes into ADR 0014).
- Replacing the cookie session with tokens. Every method ends in the same server-side, revocable session.
- Full device attestation (attestation is requested as `none`).

### 1.4 What already exists and how Module 5 changes it

| Existing                                                                                            | Change in Module 5                                                                                                 |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `users` has no email; the only credential is a password (plus optional TOTP)                        | SD-136 adds a normalised, verified `email`; SD-124 adds `webauthn_credentials`; SD-132 adds `external_identities`  |
| `sessions.auth_stage` (restricted stages, `full`), token digest, idle and absolute expiry           | SD-126 and SD-133 add `auth_methods` and `auth_time`; SD-137 adds device metadata                                  |
| Login pipeline (honeypot, limits, CAPTCHA, lock) in `auth/login-service.ts` and `login-guard.ts`    | Passkey and OIDC logins are separate entry points that reuse the session service; SD-143 inserts the risk decision |
| Temporary and administrator-issued passwords only (SEC-04 to SEC-08, SEC-20)                        | SD-136 adds a self-service reset; the administrator reset stays                                                    |
| TOTP enrolment (`auth/totp-service.ts`) with an administrator reset permission (`users:reset-totp`) | SD-127 generalises "second factor" to TOTP or passkey, with a role policy                                          |
| Security settings (lockout, timeouts, password policy) editable by the administrator                | SD-127 and SD-144 add MFA-required and risk-policy settings                                                        |

---

## 2. Architecture and conventions

### 2.1 Authentication methods and the session

```text
  password ─────┐
  passkey ──────┼─▶ session-service.createSession(user, { methods: [...], authTime, risk })
  oidc ─────────┘          │
  totp / passkey step-up ──┘ upgrades `authStage` and appends to `methods`
```

A session records **how** it was authenticated (`password`, `totp`, `passkey`, `oidc`, `recovery_code`) and **when** (`auth_time`, updated by a step-up). Authorization checks may require a method set (for example "multi-factor") and a freshness (for example "authenticated within 10 minutes"). Decision D5-01: this mirrors the OIDC `amr` and `auth_time` concepts so OIDC logins map cleanly.

### 2.2 Conventions inherited (unchanged)

Strict Zod bodies; `defineRoute` with explicit authentication option; permission matrix and its doc test; injected clock; generic error envelopes that do not distinguish unknown, blocked or deleted accounts (SEC-01, SEC-02, SEC-34); Origin plus HMAC CSRF on authenticated mutations; audit fail-closed policy; Polish API messages, English UI.

### 2.3 New configuration (`.env.example`)

```bash
# WebAuthn (SD-124). RP ID must be a registrable suffix of the origin's host.
WEBAUTHN_RP_ID=localhost
WEBAUTHN_RP_NAME=SecureDesk
# OIDC (SD-130). Leave OIDC_ISSUER empty to disable single sign-on.
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_SCOPES=openid profile email
# Mail (SD-135)
SMTP_URL=smtp://localhost:1025
MAIL_FROM=SecureDesk <no-reply@securedesk.local>
# GeoIP (SD-140). Optional offline database; absent means neutral risk.
GEOIP_DB_PATH=
# Test-only: deterministic risk context from headers. Refused when NODE_ENV=production.
# RISK_TEST_HEADERS=true
```

### 2.4 Standards covered

W3C WebAuthn Level 3 and FIDO2 CTAP2; OpenID Connect Core 1.0, OAuth 2.0 Security Best Current Practice (RFC 9700), PKCE (RFC 7636); NIST SP 800-63B (authenticator assurance, recovery); OWASP ASVS V2 (authentication), V3 (session), V6 (cryptography); OWASP Forgot Password and Authentication cheat sheets.

---

## 3. Data model additions

| Table                  | Columns (summary)                                                                                                                                                                                | Notes                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `users` (altered)      | `email_normalized` unique nullable, `email_verified_at`                                                                                                                                          | Added in SD-136; display email kept in `email`                                      |
| `webauthn_credentials` | `id` (credential id, `bytea` unique), `user_id`, `public_key bytea`, `sign_count bigint`, `transports text[]`, `aaguid`, `backup_eligible`, `backup_state`, `name`, `created_at`, `last_used_at` | Max 10 per user                                                                     |
| `auth_challenges`      | `id`, `purpose` (`WEBAUTHN_REGISTER`, `WEBAUTHN_LOGIN`, `OIDC_STATE`, …), `user_id` nullable, `challenge`, `expires_at`, `consumed_at`                                                           | Single-use, 5-minute expiry; kept in Postgres (authoritative), cached nowhere       |
| `recovery_codes`       | `id`, `user_id`, `code_hash` (Argon2id), `used_at`, `created_at`                                                                                                                                 | 10 per set; regenerating deletes the old set                                        |
| `external_identities`  | `id`, `provider`, `subject`, `user_id`, `email_at_link`, `created_at`, unique `(provider, subject)`                                                                                              |                                                                                     |
| `password_resets`      | `id`, `user_id`, `token_digest`, `expires_at`, `used_at`, `requested_ip_hash`, `created_at`                                                                                                      | SHA-256 digest of a 256-bit token                                                   |
| `email_outbox`         | `id`, `to_normalized`, `template`, `payload jsonb` (no secrets except one-time links), `status`, `attempts`, `next_attempt_at`, `created_at`                                                     | Sent by a worker; rows purged after 7 days                                          |
| `sessions` (altered)   | `auth_methods text[]`, `auth_time`, `user_agent_summary`, `ip_prefix`, `country`, `device_id_hash`, `risk_score`                                                                                 | Raw IP stays only in the audit log; sessions keep a /24 (IPv4) or /48 (IPv6) prefix |
| `login_contexts`       | `id`, `user_id`, `device_id_hash`, `country`, `ip_prefix`, `first_seen_at`, `last_seen_at`, `seen_count`                                                                                         | Retained 180 days (policy in SD-191)                                                |

---

## 4. Permission additions

| Code                                        | Meaning                                                        | Roles         |
| ------------------------------------------- | -------------------------------------------------------------- | ------------- |
| `passkeys:manage-own`                       | Register, rename and remove own passkeys and recovery codes    | Every role    |
| `sessions:manage-own`                       | List and revoke own sessions                                   | Every role    |
| `users:reset-passkeys`                      | Remove all passkeys of another user after an out-of-band check | Administrator |
| `auth-policy:read` and `auth-policy:update` | Read and change MFA-required and risk policies                 | Administrator |

The protected `ADMIN` account cannot be the target of `users:reset-passkeys` (same rule as TOTP recovery).

---

## 5. API contract

### 5.1 New endpoints (summary)

| Method and path                                                                               | Purpose                                        | Stage / permission              |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------- |
| `POST /api/auth/passkeys/register/options`, `.../verify`                                      | Registration ceremony                          | Full session with fresh step-up |
| `POST /api/auth/passkeys/login/options`, `.../verify`                                         | Authentication ceremony (usernameless)         | Anonymous, limited              |
| `GET/PATCH/DELETE /api/auth/passkeys[/{id}]`                                                  | Manage own passkeys                            | `passkeys:manage-own`           |
| `POST /api/auth/step-up`                                                                      | Re-authenticate with password, TOTP or passkey | Full session                    |
| `POST /api/auth/recovery-codes`, `POST /api/auth/login/recovery`                              | Generate; sign in second factor with a code    | Full; restricted TOTP stage     |
| `GET /api/auth/oidc/start`, `GET /api/auth/oidc/callback`                                     | Authorization Code with PKCE                   | Anonymous                       |
| `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`                             | Self-service recovery                          | Anonymous, CAPTCHA, limited     |
| `GET /api/me/sessions`, `DELETE /api/me/sessions/{id}`, `POST /api/me/sessions/revoke-others` | Device sessions                                | `sessions:manage-own`           |
| `GET/PUT /api/admin/auth-policy`                                                              | MFA and risk policy                            | `auth-policy:*`                 |
| `DELETE /api/admin/users/{id}/passkeys`                                                       | Administrative passkey reset                   | `users:reset-passkeys`          |

### 5.2 Error codes added (messages Polish)

`STEP_UP_REQUIRED` (403), `MFA_ENROLMENT_REQUIRED` (403, restricted stage), `PASSKEY_VERIFICATION_FAILED` (401, generic), `OIDC_LOGIN_FAILED` (401, generic), `RESET_LINK_INVALID` (400, generic), `RISK_DENIED` is **never** returned: a denied login uses the existing generic invalid-credentials envelope (SD-143).

---

## 6. Detailed implementation backlog

### Task ID map

| Epic                            | Tasks                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| 25 Passkeys and WebAuthn        | 25.1 = SD-124, 25.2 = SD-125, 25.3 = SD-126, 25.4 = SD-127, 25.5 = SD-128, 25.6 = SD-129 |
| 26 OIDC Single Sign-On          | 26.1 = SD-130, 26.2 = SD-131, 26.3 = SD-132, 26.4 = SD-133, 26.5 = SD-134                |
| 27 Recovery and Device Sessions | 27.1 = SD-135, 27.2 = SD-136, 27.3 = SD-137, 27.4 = SD-138, 27.5 = SD-139                |
| 28 Adaptive Authentication      | 28.1 = SD-140, 28.2 = SD-141, 28.3 = SD-142, 28.4 = SD-143, 28.5 = SD-144, 28.6 = SD-145 |

---

## EPIC 25 — Passkeys and WebAuthn

### SD-124 / Task 25.1 — Credential model, WebAuthn configuration and challenge store

**Priority:** P0 · **Size:** M · **Labels:** [STANDARD], backend, database, security · **Depends on:** SD-107, SD-96

**Objective:** Lay the data and configuration foundation: where credentials live, how challenges are issued and consumed once, and how the relying party is identified.

**Implementation checklist**

- Migration for `webauthn_credentials` and `auth_challenges` (section 3); permission `passkeys:manage-own` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- `server/auth/webauthn/config.ts`: RP ID from `WEBAUTHN_RP_ID`, expected origin from `APP_ORIGIN`; start-up refuses an RP ID that is not a suffix of the origin's host, and in production refuses `localhost`.
- Library: `@simplewebauthn/server` wrapped in `server/auth/webauthn/ceremony.ts` so the rest of the code sees only our types.
- Challenge service: 32 random bytes, purpose-bound, 5-minute expiry, consumed in the same transaction as the verification (`consumed_at` set with a conditional update, so replays fail).
- ADR `0011-passkeys.md`: attestation `none`, user verification `required`, resident keys `preferred`, algorithms ES256 and RS256 only.

**Acceptance criteria**

- [ ] A challenge can be consumed once; a second use, an expired one, or one with the wrong purpose is refused (SEC-119).
- [ ] An origin or RP ID mismatch in a verification is refused (SEC-120).
- [ ] Start-up validation rejects an invalid or production-unsafe RP ID.
- [ ] Minimum 80% test coverage for this module.

### SD-125 / Task 25.2 — Registration ceremony

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-124, SD-127 (step-up)

**Objective:** An authenticated user adds a passkey, safely.

**Implementation checklist**

- `register/options`: requires a full session and a step-up newer than 10 minutes (`STEP_UP_REQUIRED` otherwise); builds options with `excludeCredentials` of the user's existing credentials, `userVerification: required`, a random opaque user handle (`user_handle` per user, **not** the login or id), 60-second timeout; stores the challenge.
- `register/verify`: verifies origin, RP ID hash, challenge, user verification flag and algorithm; rejects a credential ID already registered to anyone; stores public key, counter, transports, AAGUID, backup flags; maximum 10 per user.
- Audit events `PASSKEY_REGISTERED`, `PASSKEY_REGISTRATION_FAILED` (reason codes only); notification email (SD-138) when added.
- Name: 1 to 40 characters, sanitised with `sanitizeForLog`.

**Acceptance criteria**

- [ ] Registration without a fresh step-up returns `403 STEP_UP_REQUIRED` (SEC-119).
- [ ] A reused challenge, wrong origin or wrong RP ID fails with the generic error and writes `PASSKEY_REGISTRATION_FAILED` (SEC-120).
- [ ] Registering the same authenticator twice, or an eleventh credential, is refused.
- [ ] The user handle is random and unrelated to the login.
- [ ] Minimum 80% test coverage for this module.

### SD-126 / Task 25.3 — Passkey authentication ceremony and session creation

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, security · **Depends on:** SD-124, SD-111

**Objective:** Sign in with a passkey, without a password and without revealing which accounts exist.

**Implementation checklist**

- `login/options`: anonymous, rate-limited per address (shared limiter), returns a challenge with an empty `allowCredentials` (discoverable credentials, usernameless).
- `login/verify`: looks up the credential by ID, verifies signature, challenge, origin, RP ID, user-verification flag and counter; unknown credential, wrong signature, replayed challenge and blocked or deleted user all return the **same** generic `401 PASSKEY_VERIFICATION_FAILED` with indistinguishable timing (do the same work, compare in constant time, add a dummy verification for the unknown case).
- Counter handling: if both stored and reported counters are non-zero and the reported one is not greater, refuse and raise a security event `PASSKEY_CLONE_SUSPECTED` (SEC-122); counters equal to zero (synced passkeys) are accepted.
- On success create a full session with `methods = ['passkey']`, `auth_time = now`; passkeys with user verification count as multi-factor. A user with `must_change_password` is **not** exempt: the initial-change stage still applies to password-only sessions, and a passkey session skips it (the temporary password is irrelevant), decision D5-02.
- Account locks from password failures (Module 2) do **not** block passkey login, since the lock defends password guessing; `is_blocked` and soft-delete do (SEC-123).
- Audit events `AUTH_PASSKEY_LOGIN` success and failure (reason enum), IP-address failure limits as in Module 2; the honeypot and the CAPTCHA do not apply (no password to guess), but the per-address limit and IP block do.

**Acceptance criteria**

- [ ] A valid assertion creates a session with `methods = ['passkey']`; the audit entry records the method (SEC-123).
- [ ] Unknown credential, forged signature, replayed challenge, wrong origin and a blocked owner produce byte-identical envelopes and similar timing (SEC-121, SEC-124).
- [ ] A counter regression with non-zero counters is refused and creates a security event (SEC-122).
- [ ] A password-locked account can still use its passkey; a blocked account cannot (SEC-123).
- [ ] Minimum 80% test coverage for this module.

### SD-127 / Task 25.4 — Step-up authentication and the multi-factor policy

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], [STANDARD], backend, security · **Depends on:** SD-124, Module 1 (TOTP)

**Objective:** Treat "second factor" as TOTP **or** passkey, let the administrator require it by role, and demand fresh authentication for sensitive actions.

**Implementation checklist**

- Add `auth_methods` and `auth_time` to `sessions`; a helper `requireFreshAuth(maxAgeSeconds)` for `defineRoute` that returns `403 STEP_UP_REQUIRED` with the accepted methods.
- `POST /api/auth/step-up`: accepts the current password, a TOTP code or a passkey assertion; success updates `auth_time` and appends the method; failures count against the same limiter as password-change failures (SEC-60 pattern).
- Policy: security settings `mfa_required_roles` (set of roles, default empty) and `step_up_max_age_minutes` (default 10, range 1 to 60); a user in a required role without TOTP or passkey receives the restricted stage `MFA_ENROLMENT_REQUIRED` (allowed endpoints: enrolment, logout, `me`), enforced in the backend stage check, not in Angular (SEC-125).
- Sensitive routes that now require step-up: password change, passkey and TOTP management, API key and webhook creation, administrator user create, role change, reset, block, delete, security settings and auth-policy changes, audit export.
- Cannot remove the last second factor of a user whose role requires it (SEC-127); administrator reset (`users:reset-passkeys`, existing `users:reset-totp`) revokes all target sessions and is audited.
- Update `docs/permissions.md`, `docs/architecture.md` (session model), the threat model.

**Acceptance criteria**

- [ ] With `mfa_required_roles = {manager}`, a manager without a second factor reaches nothing except enrolment (SEC-125).
- [ ] A sensitive action with `auth_time` older than the window returns `STEP_UP_REQUIRED`; after a successful step-up the same call works (SEC-126).
- [ ] Removing the last second factor of a required role is refused (SEC-127).
- [ ] The administrator reset removes factors, revokes sessions and cannot target `ADMIN` (SEC-129).
- [ ] Minimum 80% test coverage for this module.

### SD-128 / Task 25.5 — Passkey management UI and recovery codes

**Priority:** P1 · **Size:** L · **Labels:** [DESIGN], frontend, backend, security · **Depends on:** SD-125, SD-126

**Objective:** Users can manage passkeys, and a lost authenticator does not mean a lost account.

**Implementation checklist**

- Angular page `/account/security`: list passkeys (name, created, last used, synced or device-bound), add (with `navigator.credentials.create` and graceful unsupported-browser message), rename, remove (step-up required), TOTP status, recovery codes panel.
- Recovery codes: 10 single-use codes of 10 characters (Crockford base32, CSPRNG), stored as Argon2id hashes, displayed once and held in memory; regenerating invalidates the old set; a code is accepted only on the restricted second-factor stage and creates an audit event and an email (SD-138); a used code cannot be reused.
- Login UI: "Sign in with a passkey" button (conditional UI autofill where supported) beside the password form.
- Component tests for each state; E2E in SD-129.

**Acceptance criteria**

- [ ] Recovery codes are shown once, never stored in plaintext, and a used code fails (SEC-128).
- [ ] Regenerating invalidates every code of the previous set (SEC-128).
- [ ] Removing a passkey needs step-up; the UI never shows credential IDs or public keys.
- [ ] Minimum 80% test coverage for this module.

### SD-129 / Task 25.6 — Tests with a virtual authenticator, documentation and threat model

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], testing, docs · **Depends on:** SD-125, SD-126, SD-127, SD-128

**Objective:** Prove the ceremonies in a real browser and in deterministic unit tests.

**Implementation checklist**

- Playwright helper enabling the Chromium DevTools virtual authenticator (`WebAuthn.addVirtualAuthenticator`, CTAP2, internal, resident key, user verification); specs: register, log in, remove, step-up, policy enrolment, recovery code.
- Unit tests with fixtures signed by a test key pair (a small `tests/support/webauthn-authenticator.ts` that builds attestation and assertion objects) so negative cases (bad signature, bad flags, wrong RP hash) need no browser.
- Add SEC-119 to SEC-129 to `docs/testing.md`; extend the threat model (section 8); write `docs/passkeys.md` (flows, sequence diagram, recovery story).

**Acceptance criteria**

- [ ] E2E registers a passkey, signs out, signs in with it, and removes it (three consecutive runs green).
- [ ] Every negative case in the matrix has a unit test with a SEC title.
- [ ] `docs/passkeys.md` contains the two sequence diagrams and the recovery policy.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 26 — OIDC single sign-on

### SD-130 / Task 26.1 — OIDC client foundation and a local Keycloak realm

**Priority:** P0 · **Size:** M · **Labels:** [STANDARD], backend, devops · **Depends on:** SD-101, SD-110

**Objective:** Configure a standards-compliant relying party and a reproducible identity provider for development and CI.

**Implementation checklist**

- Library `openid-client`; `server/auth/oidc/provider.ts` performs discovery with a timeout, caches the document and JWKS (refresh on unknown `kid`, at most once per minute), validates that the issuer equals `OIDC_ISSUER` exactly.
- Compose profile `idp`: Keycloak with an imported realm `deploy/keycloak/securedesk-realm.json` (client `securedesk` as a confidential client with PKCE `S256` required, redirect URI `http://localhost:4200/api/auth/oidc/callback`, users `sso-employee` and `sso-unverified` with fixture passwords, a role claim mapper, `acr` and `amr` mappers). Fixture passwords exist only in the realm file, are marked test-only, and are rejected in production configuration.
- Start-up validation: all `OIDC_*` set or none; HTTPS issuer required in production; `localhost` issuer refused in production.
- `GET /api/auth/oidc/config` returns whether SSO is enabled and its button label, nothing else.

**Acceptance criteria**

- [ ] `docker compose --profile idp up` starts Keycloak with the realm imported; discovery succeeds.
- [ ] Partial configuration and production misconfiguration fail start-up.
- [ ] The JWKS cache refreshes once on an unknown `kid` and not more than once per minute under attack.
- [ ] Minimum 80% test coverage for this module.

### SD-131 / Task 26.2 — Authorization Code flow with PKCE and ID token validation

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], [HARDENING], backend, security · **Depends on:** SD-130

**Objective:** Implement the redirect flow exactly as current best practice describes, with every check explicit and tested.

**Implementation checklist**

- `start`: generate `state`, `nonce` and a PKCE verifier (`S256`), store them in `auth_challenges` (purpose `OIDC_STATE`, 10-minute expiry, bound to a random `__Host-sd_oidc` cookie that is `HttpOnly`, `Secure`, `SameSite=Lax`, path `/api/auth/oidc`); validated `returnTo` is a relative path from an allowlist of SPA routes (open redirect refused, SEC-137).
- `callback`: require the cookie, a matching unconsumed `state`, an `iss` parameter equal to the configured issuer (RFC 9207 when present), exchange the code with the verifier, validate the ID token: signature with allowed algorithms only (`RS256`, `ES256`, `EdDSA`; `none` and `HS*` refused), `iss`, `aud` equals client ID, `azp` when multiple audiences, `exp`, `iat` skew of 60 seconds, `nonce`; the access token is not stored or used.
- All failures return one generic `401 OIDC_LOGIN_FAILED` and write `AUTH_OIDC_LOGIN` failure with a reason enum; the user sees the login page with a neutral message.
- Rate limits per address on both endpoints; timeouts on all outbound calls; no token or code in logs or URLs after the callback (redirect to a clean URL).

**Acceptance criteria**

- [ ] Missing, tampered, replayed or expired `state`, and a missing cookie, are refused with no session (SEC-130).
- [ ] Wrong `nonce`, `aud`, `iss`, expired token, `alg: none` and `HS256` signed with the public key are refused (SEC-131).
- [ ] A callback whose verifier does not match (code interception) is refused (SEC-132).
- [ ] `returnTo` pointing outside the allowlist is ignored (SEC-137).
- [ ] Minimum 80% test coverage for this module.

### SD-132 / Task 26.3 — Account provisioning and linking policy

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, database, security · **Depends on:** SD-131, SD-136

**Objective:** Decide safely which local account an external identity maps to, because account-linking mistakes are the classic SSO takeover.

**Implementation checklist**

- Migration `external_identities`; unique `(provider, subject)`.
- Resolution order: (1) existing link by `(issuer, sub)`; (2) otherwise, if setting `oidc_link_by_verified_email` is on **and** the ID token has `email_verified = true` **and** the local account's email is verified **and** the account is not protected `ADMIN` and not blocked or deleted, link after a step-up confirmation by the local user (never silent); (3) otherwise, if setting `oidc_jit_provisioning` is on, create a user with the **Guest** role, no password hash usable (random Argon2id of 32 random bytes, never disclosed), and `must_change_password = false`; (4) otherwise refuse generically.
- Blocked and soft-deleted users are refused (SEC-136); `ADMIN` can never be linked or created through OIDC (SEC-135).
- Defaults: both settings off; the administrator enables them in the auth policy (SD-144).
- Audit events `AUTH_OIDC_LINKED`, `AUTH_OIDC_PROVISIONED` with provider and subject reference (keyed, not the raw `sub`).

**Acceptance criteria**

- [ ] An `email_verified = false` identity whose email matches a local account never links to it (SEC-133).
- [ ] With JIT off, an unknown subject is refused generically; with JIT on, the new user is a Guest regardless of claims (SEC-134).
- [ ] Linking requires a step-up of the local account; a stolen IdP identity alone cannot take over an existing local account (SEC-133).
- [ ] Blocked, deleted and `ADMIN` accounts are refused (SEC-135, SEC-136).
- [ ] Minimum 80% test coverage for this module.

### SD-133 / Task 26.4 — Role mapping, session semantics and logout

**Priority:** P1 · **Size:** L · **Labels:** [STANDARD], [HARDENING], backend, security · **Depends on:** SD-132, SD-127

**Objective:** Map IdP claims to SecureDesk roles without privilege escalation, and make SSO sessions behave like every other session.

**Implementation checklist**

- Setting `oidc_role_mapping`: an explicit map from claim values to role IDs; strict schema; the mapping can never produce `administrator` (validated at save and at use, SEC-135); unmapped means Guest.
- Role reconciliation on each login can only **lower or keep** privileges automatically; raising a role requires an administrator action (decision D5-04), and each change is audited.
- SSO sessions are ordinary server-side sessions (same idle and absolute limits, same revocation); `methods` gets `oidc` plus the IdP's `amr` values mapped (`mfa`, `hwk`, `otp`); `auth_time` comes from the token.
- Lockout and CAPTCHA are not applied to SSO; IP block and rate limits are.
- RP-initiated logout (`end_session_endpoint` with `id_token_hint`) when the user signs out of an SSO session, optional via setting; local logout always works even if the IdP is down.
- Back-channel logout is out of scope (record as O5-02).

**Acceptance criteria**

- [ ] A claim equal to `administrator` does not create or promote an administrator unless explicitly mapped, and an explicit mapping to `administrator` is rejected at save (SEC-135).
- [ ] An SSO user blocked locally loses sessions immediately (existing SEC-18 behaviour) and cannot sign in again (SEC-136).
- [ ] Logout revokes the local session; an IdP outage does not prevent it (SEC-138).
- [ ] Minimum 80% test coverage for this module.

### SD-134 / Task 26.5 — SSO UI, E2E against Keycloak and documentation

**Priority:** P1 · **Size:** M · **Labels:** [PORTFOLIO], frontend, testing, docs · **Depends on:** SD-131, SD-133

**Objective:** A visible, tested single sign-on journey.

**Implementation checklist**

- Login page shows "Sign in with <label>" only when `GET /api/auth/oidc/config` says enabled; neutral error banner for `OIDC_LOGIN_FAILED`.
- Account page lists the linked identity with an unlink action (step-up required; refused when it would leave the user without any usable credential).
- Playwright against the `idp` profile: successful login of `sso-employee` (JIT on), refused `sso-unverified` linking attempt, tampered `state` via request interception, expired code.
- `docs/sso.md`: sequence diagram, claims used, settings, Keycloak setup, how to point at another IdP.

**Acceptance criteria**

- [ ] The E2E journey signs in through Keycloak and lands on the dashboard with the Guest role.
- [ ] Unlinking the only credential is refused.
- [ ] `docs/sso.md` reproduces the setup from a clean clone.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 27 — Recovery and device sessions

### SD-135 / Task 27.1 — Mail service with outbox, templates and Mailpit

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, devops · **Depends on:** SD-106, SD-101

**Objective:** One safe way to send email, used by recovery now and by notifications in Module 7.

**Implementation checklist**

- `server/mail/mailer.ts`: `interface Mailer { send(message) }`; SMTP implementation with `nodemailer`, TLS required unless the host is loopback, timeouts; `FakeMailer` for tests capturing messages.
- `email_outbox` table and a worker (interval job using the same scheduler pattern as `scheduled-verification.ts`) with retries 1 min, 10 min, 1 h, then `FAILED`; at-least-once; rows purged after 7 days.
- Templates in `server/mail/templates/` (plain text first, minimal HTML), rendered with escaped variables; subjects and headers sanitised against header injection (CR and LF refused).
- Mailpit in the compose `mail` profile; `MAIL_FROM` validated.
- Rules: no password, TOTP secret or recovery code in any mail; one-time links only, `Cache-Control` irrelevant but links carry no personal data beyond the token; mail bodies are never logged.

**Acceptance criteria**

- [ ] A message with CR or LF in the recipient or subject is refused (header injection test).
- [ ] An SMTP outage retries on the documented schedule and never delays or fails the originating request (SEC-145).
- [ ] The sent mail appears in Mailpit during E2E with the expected link.
- [ ] Minimum 80% test coverage for this module.

### SD-136 / Task 27.2 — Verified email and self-service password reset

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], [STANDARD], backend, frontend, security · **Depends on:** SD-135, SD-111

**Objective:** Users reset their own forgotten password without an administrator, without enabling account enumeration or token theft.

**Implementation checklist**

- Migration adding `email`, `email_normalized` (unique, nullable) and `email_verified_at` to `users`; administrators set the email at user creation or edit; a verification link mail confirms it (token as below); only a verified email can receive reset links.
- `POST /api/auth/password/forgot`: always returns the same `202` and the same body, after the same amount of work (dummy token generation and hashing for unknown emails), regardless of existence, blocked, deleted or unverified state (SEC-139); requires the CAPTCHA (same provider as password change); limits per address and per normalised email (SEC-142).
- Token: 32 random bytes (base64url), stored as SHA-256 digest in `password_resets`, 30-minute expiry, single use, a new request invalidates earlier ones, `requested_ip_hash` keyed.
- `POST /api/auth/password/reset` with token and new password: applies the existing password policy, history of the last five, banned list and personal-data rule (SEC-09 to SEC-14); on success: revokes **all** sessions, clears any lock, marks the token used, invalidates other tokens, sends a "password changed" mail; the protected `ADMIN` account is **excluded** from self-service reset and stays on the CLI `admin:unlock` and database procedure (D5-03).
- Audit events `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `PASSWORD_RESET_REFUSED` (reason enum), subject by keyed reference for unknown emails (SD-67 pattern).
- Angular pages `/forgot-password` and `/reset-password` (token read from the URL fragment is **not** possible server-side; use the query parameter once, then `history.replaceState` to remove it, and set `Referrer-Policy: no-referrer` already globally).

**Acceptance criteria**

- [ ] Existing, unknown, blocked and unverified emails produce an identical response with similar timing (SEC-139).
- [ ] The token is stored only as a digest, expires at exactly 30 minutes on the fake clock, works once, and dies with a newer request or a password change (SEC-140).
- [ ] A reset applies password policy and history, revokes every session and sends a notification (SEC-141).
- [ ] Rate limits and CAPTCHA stop mass requests (SEC-142); `ADMIN` is excluded.
- [ ] Minimum 80% test coverage for this module.

### SD-137 / Task 27.3 — Device sessions: list and revoke

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], [STANDARD], backend, frontend · **Depends on:** SD-106

**Objective:** Users see where they are signed in and can end sessions they do not recognise.

**Implementation checklist**

- Migration adding session metadata (section 3); on creation record a coarse user-agent summary (browser family and major version, OS family, via a small parser, never the raw string beyond 200 characters), the IP prefix, country (if GeoIP is available), `device_id_hash`.
- Endpoints: `GET /api/me/sessions` (own, non-revoked, non-expired; marks the current one), `DELETE /api/me/sessions/{id}` (own only; another user's id returns `404`), `POST /api/me/sessions/revoke-others`; permission `sessions:manage-own`; step-up not required for ending sessions (safe direction), required for nothing here.
- Audit events `SESSION_REVOKED_BY_USER` with the target session id.
- Angular page `/account/sessions` with current-device highlight and "Sign out everywhere else".

**Acceptance criteria**

- [ ] A user lists only their own sessions; revoking another user's session id returns `404` (SEC-143).
- [ ] "Revoke others" keeps the current session and ends all others immediately; the revoked cookie fails at once (SEC-143).
- [ ] The list shows no token, digest or full IP address.
- [ ] Minimum 80% test coverage for this module.

### SD-138 / Task 27.4 — Security notifications and trusted devices

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], [HARDENING], backend · **Depends on:** SD-135, SD-137

**Objective:** Tell users about security-relevant changes to their account, quietly and usefully.

**Implementation checklist**

- Mail on: sign-in from a new device, password change or reset, passkey added or removed, TOTP enabled or disabled, recovery codes generated or used, SSO account linked, sessions revoked by an administrator.
- Trusted-device cookie `__Host-sd_device` (random 32 bytes, `HttpOnly`, `Secure`, `SameSite=Lax`, 180 days) stores only a hash in `login_contexts`; a "new device" is a context whose hash is unseen for that user; one mail per new device per day maximum.
- Mail content: event type, time (UTC), coarse place (country) and device summary, a link to the sessions page; never a link that performs an action, never secrets.
- Per-user preference to disable non-critical notices; critical ones (password change, factor changes, recovery code use) cannot be disabled.

**Acceptance criteria**

- [ ] A first login from a new device sends one mail; the second login from the same device sends none (SEC-144).
- [ ] The trusted-device cookie value is not stored; only its hash is (SEC-144).
- [ ] Mail sending failure never fails or delays the login (SEC-145).
- [ ] Critical notices cannot be turned off.
- [ ] Minimum 80% test coverage for this module.

### SD-139 / Task 27.5 — Tests, timing checks and documentation for recovery and sessions

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], testing, docs · **Depends on:** SD-136, SD-137, SD-138

**Objective:** Close the epic with the tests that matter most for recovery: enumeration, timing and token handling.

**Implementation checklist**

- Statistical timing test (many samples, median comparison with a tolerance) for `forgot` across existing, unknown and blocked emails; documented as a smoke guard, not a proof.
- E2E: forgot password through Mailpit, reset, sign in with the new password, old sessions dead; sessions page revoke across two browser contexts.
- Update `docs/testing.md` (SEC-139 to SEC-145), `docs/architecture.md`, threat model, README feature list.
- Document the administrator procedure for `ADMIN` (outside self-service).

**Acceptance criteria**

- [ ] The E2E journeys pass three consecutive runs.
- [ ] No mail, log line or audit entry in the test run contains a token or password (scanner step over captured output).
- [ ] Docs updated and the traceability check is green.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 28 — Adaptive authentication

### SD-140 / Task 28.1 — GeoIP and network context service

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend · **Depends on:** SD-110

**Objective:** Provide country-level location and basic network classification from an offline database, with no external calls. Later modules reuse this service.

**Implementation checklist**

- `server/geo/geoip.ts` using `maxmind` to read a local MMDB (DB-IP Lite country or city, licence CC BY 4.0, attribution in the README and UI footer); path from `GEOIP_DB_PATH`; absent database means every lookup returns `{ country: null }` and a start-up warning, never an error.
- Script `npm run geoip:fetch` downloading the monthly file with checksum verification into `data/geoip/` (documented, never run in CI or tests).
- Test fixtures: a tiny synthetic MMDB generated at test time (`mmdb-lib` writer or a committed binary under 20 KB with a README on how it was made) mapping documentation address ranges (RFC 5737, RFC 3849) to fixed countries.
- Private, loopback and unspecified addresses return `{ country: null, kind: 'private' }`; the lookup is a pure function of the raw client address and never receives user data.
- Health endpoint shows GeoIP availability and database build date.

**Acceptance criteria**

- [ ] Fixture addresses resolve to the expected countries; private addresses resolve to `private`.
- [ ] With no database configured, lookups are neutral and the app starts (SEC-150).
- [ ] A lookup performs no network access (test with a network guard).
- [ ] Minimum 80% test coverage for this module.

### SD-141 / Task 28.2 — Login context history

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], backend, database, security · **Depends on:** SD-140, SD-138

**Objective:** Remember, per user, the devices and countries seen at successful logins, as the baseline for risk decisions, with minimal personal data.

**Implementation checklist**

- Migration `login_contexts` (section 3); upsert at every successful login (all methods) inside the session-creation transaction.
- Stores only: device hash, country, IP prefix (/24 or /48), first and last seen, count; no user agent, no raw IP (raw IP stays in the audit log).
- Query helpers: `isKnownDevice(userId, hash)`, `knownCountries(userId)`, `lastSuccessfulContext(userId)` (for travel speed), all with indexes on `(user_id, last_seen_at)`.
- Retention: rows older than the retention policy are removed by the maintenance job (180 days default, settable; the policy engine of SD-191 later takes over); the audit log is untouched.
- Cap of 50 contexts per user (oldest evicted) to bound storage.

**Acceptance criteria**

- [ ] A successful login by any method upserts exactly one context row; a failed login writes none.
- [ ] The table contains no raw IP address, user agent or token (schema test).
- [ ] The retention job removes expired contexts and never touches `audit_log` (SEC-78 still holds).
- [ ] Minimum 80% test coverage for this module.

### SD-142 / Task 28.3 — Risk engine

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], [HARDENING], backend, security · **Depends on:** SD-141, SD-140

**Objective:** A deterministic, explainable function from signals to a score and a level, with no side effects, so it can be unit tested exhaustively and later reused by playbooks.

**Implementation checklist**

- `server/risk/engine.ts`: `evaluate(context, history, policy, now) -> { score: 0..100, level: 'LOW'|'MEDIUM'|'HIGH', reasons: Reason[] }` where each `Reason` is `{ code, weight }`.
- Signals and default weights: new device (+25), new country (+30), impossible travel (+60: great-circle distance between the previous and current country centroids divided by elapsed time above 900 km/h, only when both countries are known and the elapsed time is under 12 hours), burst of failed attempts on the account in the last 10 minutes (+20), address flagged by reputation (+30, effective once SD-147 exists), first login of an account (no history: neutral, 0), unusual hour (+0 default, tunable; off by default to avoid bias). Weights capped by the policy; the sum is clamped to 100.
- Thresholds from policy: MEDIUM at 40, HIGH at 70 (defaults).
- Country centroid table committed as a small JSON (ISO 3166-1 alpha-2 to latitude and longitude); unknown countries disable the travel signal.
- Exhaustive table-driven tests with the fake clock; property test that scores are monotone in added signals.

**Acceptance criteria**

- [ ] A new device alone scores MEDIUM only if the policy threshold says so; new device plus new country in under 30 minutes at implausible distance scores HIGH (SEC-146, SEC-147).
- [ ] Missing GeoIP data produces a neutral country signal and never a denial (SEC-150).
- [ ] `reasons` lists every contributing signal with its weight; the output is stable for identical input.
- [ ] The engine imports no database, clock or network module (lint boundary rule).
- [ ] Minimum 80% test coverage for this module.

### SD-143 / Task 28.4 — Enforcement in the login pipeline

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, security · **Depends on:** SD-142, SD-127, SD-126

**Objective:** Apply the risk decision after the credentials verify and before the session is created, without leaking the reason to an attacker.

**Implementation checklist**

- Insert the decision into `auth/login-service.ts` (password), the passkey login and the OIDC callback, after credential verification, before session creation.
- Policy outcomes: LOW creates the session; MEDIUM requires a second factor: if the user has TOTP or a passkey the login stops at the restricted TOTP or passkey stage, otherwise the login proceeds, the session is marked `elevated_risk`, sensitive routes require step-up (SD-127), and the user is notified (SD-138); HIGH refuses with the **existing generic invalid-credentials envelope** and status, records an audit entry with score and reason codes, raises a security event `RISK_LOGIN_DENIED` (severity HIGH) and counts a failure toward the address limit but not the account lock (avoid weaponising risk to lock victims out, D5-05).
- Protected `ADMIN`: never hard-denied; HIGH forces step-up with an enrolled factor, otherwise creates a CRITICAL alert and allows the login (prevents permanent self-lockout; the break-glass CLI remains), D5-06.
- A passkey login with user verification lowers MEDIUM to LOW (a phishing-resistant factor was already presented) but never lowers HIGH.
- Responses and timing for HIGH match a wrong password; the reason appears only in the audit entry and the security event.
- Feature flag in policy (`risk_enabled`, default off) so existing behaviour and tests are unchanged until enabled.

**Acceptance criteria**

- [ ] A HIGH-risk login with the correct password returns the same status, body and similar timing as a wrong password and creates the audit entry and event (SEC-148).
- [ ] A MEDIUM login with TOTP enrolled demands the code; without any factor it proceeds in an elevated session (SEC-149).
- [ ] `ADMIN` is never hard-denied by risk (SEC-151).
- [ ] With `risk_enabled = false`, no behaviour changes (all earlier tests pass).
- [ ] Minimum 80% test coverage for this module.

### SD-144 / Task 28.5 — Policy administration, explainability and the OIDC and MFA settings page

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], frontend, backend · **Depends on:** SD-143, SD-127, SD-132

**Objective:** One administrator page for authentication policy, and clear explanations of every risk decision.

**Implementation checklist**

- `GET/PUT /api/admin/auth-policy` (permissions `auth-policy:read` and `auth-policy:update`, step-up required, strict schema with ranges): `mfa_required_roles`, `step_up_max_age_minutes`, `risk_enabled`, thresholds, signal weights, `oidc_jit_provisioning`, `oidc_link_by_verified_email`, `oidc_role_mapping`; one audit entry per change with old and new values (SEC-70 pattern).
- Angular page `/admin/auth-policy`: grouped forms, validation mirroring the server, a "simulate" panel that runs the pure risk engine on sample inputs via a read-only endpoint and shows the score breakdown.
- Audit drawer and security-events view show the risk score and reason codes for denied and stepped-up logins, and **country only**, never coordinates.
- Per-user view (administrator): known device count and countries, with a "forget contexts" action (audited).

**Acceptance criteria**

- [ ] Only the Administrator can read or change the policy; values outside range are refused; each change writes one audit entry (SEC-152).
- [ ] The simulate endpoint changes no state and returns the same breakdown as production decisions.
- [ ] Risk reasons appear in the audit drawer and the events list; no precise location is shown or stored (SEC-152).
- [ ] Minimum 80% test coverage for this module.

### SD-145 / Task 28.6 — Module 5 verification, E2E journey, documentation

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], testing, docs · **Depends on:** all P0 tasks of Module 5

**Objective:** Close the module with an end-to-end proof and updated documentation.

**Implementation checklist**

- Journeys: register a passkey, sign in with it, require MFA for managers and watch a manager be forced to enrol; SSO login through Keycloak; forgot and reset password through Mailpit; sessions page; risk journey using `RISK_TEST_HEADERS` to simulate a new country and an impossible-travel HIGH login.
- Add SEC-119 to SEC-153 to `docs/testing.md` and the ASVS mapping (SD-122); extend `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, the threat model and the README feature list.
- Update the demo recording with the passkey and SSO journeys (optional).

**Acceptance criteria**

- [ ] All E2E journeys pass three consecutive runs on CI.
- [ ] SEC-119 to SEC-153 map to real test titles; the traceability and ASVS checks are green.
- [ ] Docs describe every method, the session model and the recovery story.
- [ ] Minimum 80% test coverage for this module.

---

## 7. Security acceptance test matrix

| ID      | Scenario                                                                            | Expected outcome                                                                       | Evidence             |
| ------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------- |
| SEC-119 | Reuse, expire or mis-purpose a WebAuthn challenge; register without fresh step-up   | Refused; `403 STEP_UP_REQUIRED` for the latter                                         | Unit and API test    |
| SEC-120 | Wrong origin or RP ID in registration and in assertion                              | Refused generically; failure recorded                                                  | Unit test            |
| SEC-121 | Unknown credential, forged signature, replayed challenge                            | Identical generic envelope                                                             | API test             |
| SEC-122 | Reported counter not greater than stored (both non-zero)                            | Refused, `PASSKEY_CLONE_SUSPECTED` event; counter zero accepted                        | Unit test            |
| SEC-123 | Passkey login for normal, password-locked and blocked users                         | Session with `methods = [passkey]`; lock ignored; blocked refused                      | Integration test     |
| SEC-124 | Passkey login for unknown and blocked-owner credentials                             | Byte-identical response, similar timing                                                | Statistical test     |
| SEC-125 | Role in `mfa_required_roles`, user without a second factor                          | Restricted to enrolment endpoints only                                                 | Integration test     |
| SEC-126 | Sensitive action after the step-up window, then after step-up                       | `STEP_UP_REQUIRED`, then success                                                       | Fake-clock test      |
| SEC-127 | Remove the last second factor of a required role                                    | Refused                                                                                | Integration test     |
| SEC-128 | Recovery codes: display, use, reuse, regenerate                                     | Shown once; single use; old set dead; hashes only in DB                                | Integration test     |
| SEC-129 | Administrative passkey reset, including target `ADMIN`                              | Factors removed, sessions revoked, audited; `ADMIN` refused                            | Integration test     |
| SEC-130 | OIDC callback with missing, tampered, replayed or expired `state`; missing cookie   | Refused, no session                                                                    | Integration test     |
| SEC-131 | ID token with wrong nonce, aud, iss, expiry; `alg: none`; HS256 with the public key | Refused                                                                                | Unit test            |
| SEC-132 | Authorization code with a wrong PKCE verifier                                       | Refused                                                                                | Integration test     |
| SEC-133 | Unverified IdP email matching a local account; verified email without local step-up | Never auto-linked                                                                      | Integration test     |
| SEC-134 | Unknown subject with JIT off and on                                                 | Refused generically; Guest only when on                                                | Integration test     |
| SEC-135 | Claim `administrator`; mapping to administrator; link to `ADMIN`                    | Not promoted; mapping rejected at save; link refused                                   | Integration test     |
| SEC-136 | Blocked or deleted local user signs in through OIDC                                 | Refused; sessions gone after block                                                     | Integration test     |
| SEC-137 | `returnTo` to an external site or an unlisted path                                  | Ignored; safe default                                                                  | Unit test            |
| SEC-138 | Logout of an SSO session with the IdP down                                          | Local session revoked                                                                  | Integration test     |
| SEC-139 | `forgot` for existing, unknown, blocked, unverified email                           | Identical `202` and body; similar timing                                               | Statistical test     |
| SEC-140 | Reset token: expiry at 30 minutes, reuse, superseded, after a password change       | Valid before, refused at and after; digest only                                        | Fake-clock test      |
| SEC-141 | Reset with policy-violating, reused and valid passwords                             | Policy enforced; all sessions revoked; notice sent                                     | Integration test     |
| SEC-142 | Mass `forgot` requests without CAPTCHA; per-address and per-email floods            | Refused or throttled neutrally                                                         | Integration test     |
| SEC-143 | Session list and revoke across two users; revoke-others                             | Own sessions only; foreign id `404`; current kept                                      | API test             |
| SEC-144 | New-device login twice; trusted-device cookie storage                               | One mail; only a hash stored                                                           | Integration test     |
| SEC-145 | SMTP down during login, passkey add, reset request                                  | Operation unaffected; retries then `FAILED`                                            | Fault-injection test |
| SEC-146 | Risk engine table: new device, new country, burst, combinations                     | Scores and levels as specified; stable reasons                                         | Unit test            |
| SEC-147 | Impossible travel (two countries, 30 minutes) and plausible travel (12 hours)       | HIGH versus no travel signal                                                           | Unit test            |
| SEC-148 | HIGH-risk login with the correct password                                           | Generic envelope like a wrong password; audit entry and security event with reasons    | Integration test     |
| SEC-149 | MEDIUM-risk login with and without an enrolled factor                               | Second factor demanded; elevated session with step-up requirement                      | Integration test     |
| SEC-150 | GeoIP database missing                                                              | Neutral country, application healthy, no denial                                        | Integration test     |
| SEC-151 | HIGH risk for `ADMIN`                                                               | Never hard-denied; step-up or CRITICAL alert                                           | Integration test     |
| SEC-152 | Policy changes; risk details in audit view                                          | Administrator only, ranges enforced, one audit entry per change; country only in views | API test             |
| SEC-153 | Browser: passkey, SSO, reset, sessions, risk journeys                               | All pass three times                                                                   | E2E                  |

---

## 8. Threat model additions

| Threat                          | Risk                                                  | Planned control                                                                       | Test             |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------- |
| Phishing of passwords           | Credentials captured on a fake site                   | Passkeys bound to the RP ID; origin verified server-side                              | SEC-120          |
| Challenge replay                | A captured assertion is replayed                      | Single-use, expiring, purpose-bound challenges consumed transactionally               | SEC-119          |
| Cloned authenticator            | A copied credential is used in parallel               | Counter regression detection and security event                                       | SEC-122          |
| Account enumeration             | Attacker learns which users or emails exist           | Uniform responses and timing for login, passkey, reset                                | SEC-124, SEC-139 |
| Authorization-code interception | A stolen code is exchanged by an attacker             | PKCE `S256`, `state`, nonce, exact issuer and audience checks                         | SEC-130–132      |
| IdP account takeover            | A forged or unverified email links to a local account | Link only with verified email on both sides plus local step-up; never silent          | SEC-133          |
| Privilege escalation via claims | A claim promotes to administrator                     | Explicit mapping, never `administrator`, no automatic raise                           | SEC-135          |
| Open redirect                   | Login flow bounces to an attacker site                | Allowlist of relative return paths                                                    | SEC-137          |
| Reset token theft or reuse      | A leaked link grants a permanent takeover             | 256-bit token, digest storage, 30-minute single use, session revocation, notification | SEC-140, SEC-141 |
| Reset abuse                     | Mass mail or lock-out of victims                      | CAPTCHA, per-address and per-email limits, reset never locks accounts                 | SEC-142          |
| Session hijack unnoticed        | A stolen cookie lives on silently                     | Device session list, new-device mail, remote revoke                                   | SEC-143, SEC-144 |
| Risk engine as an oracle        | Attacker probes to learn rules or victim's countries  | Generic denial, reasons only in admin views, country-level data only                  | SEC-148, SEC-152 |
| Risk-based lock-out of victims  | Attacker triggers HIGH risk to deny the real user     | HIGH counts toward the address limit only, never the account lock; `ADMIN` exempt     | SEC-148, SEC-151 |
| Recovery code compromise        | A printed code leaks                                  | Argon2id hashes, single use, mail on use, regeneration                                | SEC-128          |

Residual risks to state: synced passkeys inherit the security of the sync provider; email is a recovery channel with its own risks; GeoIP is approximate and VPN users will look "impossible"; OIDC security depends on the IdP configuration.

---

## 9. Recommended implementation order and dependencies

- **Phase A:** SD-135 (mail), SD-127 (step-up and MFA policy foundation), SD-124.
- **Phase B:** SD-125, SD-126, SD-128, SD-129. Outcome: passkeys.
- **Phase C:** SD-136, SD-137, SD-138, SD-139. Outcome: recovery and sessions.
- **Phase D:** SD-130, SD-131, SD-132, SD-133, SD-134. Outcome: SSO (SD-132 needs the verified email of SD-136).
- **Phase E:** SD-140, SD-141, SD-142, SD-143, SD-144, SD-145. Outcome: adaptive authentication.

```text
SD-107 ─▶ SD-124 ─▶ SD-125 ─▶ SD-128 ─▶ SD-129
SD-124, SD-111 ─▶ SD-126 ─▶ SD-129
SD-124 ─▶ SD-127 ─▶ SD-125, SD-143, SD-133
SD-106, SD-101 ─▶ SD-135 ─▶ SD-136 ─▶ SD-132
SD-136 ─▶ SD-139     SD-106 ─▶ SD-137 ─▶ SD-138 ─▶ SD-141
SD-101, SD-110 ─▶ SD-130 ─▶ SD-131 ─▶ SD-132 ─▶ SD-133 ─▶ SD-134
SD-110 ─▶ SD-140 ─▶ SD-141 ─▶ SD-142 ─▶ SD-143 ─▶ SD-144 ─▶ SD-145
```

---

## 10. UI and user journeys

| Route / element                       | Change                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `/login`                              | Passkey button (conditional UI), SSO button, "Forgot password" link                |
| `/forgot-password`, `/reset-password` | New pages with CAPTCHA and a neutral confirmation                                  |
| `/account/security`                   | Passkeys, TOTP, recovery codes, linked identity                                    |
| `/account/sessions`                   | Device sessions with revoke                                                        |
| `/admin/auth-policy`                  | Policy forms and risk simulator                                                    |
| App shell                             | Step-up modal on `STEP_UP_REQUIRED`; MFA enrolment screen for the restricted stage |

Journeys: (1) a manager is required to enrol a second factor and adds a passkey; (2) a user forgets the password, resets it from mail, and every other session ends; (3) a login from a new country is stepped up with TOTP; (4) an administrator reviews a denied HIGH-risk login with reasons.

---

## 11. Definition of Done

As in `docs/course/backlog-module-4.md` section 10, plus: every authentication entry point returns a uniform failure envelope for unknown, blocked, deleted and unverified subjects; no token, code, challenge or secret appears in a log, mail log, audit entry, URL after redirect or Redis key; every new authentication method ends in the same server-side revocable session.

### 11.1 Definition of Done for the entire Module 5

- Passkeys, SSO, recovery and device sessions work end to end and are covered by SEC-119 to SEC-153.
- The administrator can require a second factor by role, and sensitive actions demand fresh authentication.
- Risk-based authentication is optional, explainable, and cannot lock victims out or lock out `ADMIN`.
- Docs (`docs/passkeys.md`, `docs/sso.md`, architecture, threat model, permissions, schema) match the code.
- All tests green with the 80% coverage gate and traceability.

---

## 12. Decisions, assumptions and open points

| ID    | Topic                     | Decision                                                                                       | Status      |
| ----- | ------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| D5-01 | Session model             | Sessions record `methods` and `auth_time`, mirroring OIDC `amr` and `auth_time`                | [DESIGN]    |
| D5-02 | Passkey and forced change | A passkey session is not subject to the initial-password-change stage                          | [DESIGN]    |
| D5-03 | `ADMIN` and self-service  | `ADMIN` is excluded from email reset, SSO linking and risk hard-denial; break-glass is the CLI | [HARDENING] |
| D5-04 | Role changes from the IdP | Automatic reconciliation may lower or keep a role, never raise it                              | [HARDENING] |
| D5-05 | Risk and lockout          | A HIGH risk denial never increments the per-account lock counter                               | [HARDENING] |
| D5-06 | Risk and `ADMIN`          | Step-up or alert, never hard denial                                                            | [HARDENING] |
| D5-07 | Attestation               | `none`; no authenticator allowlist                                                             | [DESIGN]    |
| D5-08 | SMS and push MFA          | Not offered (weak or out of scope)                                                             | [DESIGN]    |
| D5-09 | New permissions           | `passkeys:manage-own`, `sessions:manage-own`, `users:reset-passkeys`, `auth-policy:*`          | [DESIGN]    |

### 12.1 Open points

- **O5-01** Whether to ship the DB-IP Lite database in releases or only provide the fetch script (licence CC BY 4.0 allows redistribution with attribution).
- **O5-02** Back-channel logout for SSO is deferred.
- **O5-03** Whether the unverified-email state should block a user from SSO linking entirely or allow verification during the linking flow.
- **O5-04** Conditional UI (passkey autofill) browser support matrix to confirm during SD-128.

---

## 13. Recommended final verification sequence

1. `docker compose --profile idp --profile mail up --build`; seed.
2. Register a passkey as `manager1`, sign out, sign in with it; confirm the audit entry shows `passkey`.
3. Set `mfa_required_roles = {manager}`; sign in as `manager2` and confirm the enrolment screen is the only reachable page.
4. Sign in through Keycloak as `sso-employee` (JIT on); try the unverified user and confirm no linking.
5. Forgot password for an existing and an unknown email; compare responses; open Mailpit, reset, confirm old sessions died.
6. Open the sessions page in two browsers; revoke one.
7. Enable risk; log in with test headers from a second country within minutes; confirm the generic denial for the attacker view and the reasons in the admin audit drawer.
8. Run `npm test`, the E2E suite three times, and the ASVS check.

---

## 14. References

- W3C Web Authentication Level 3; FIDO Alliance passkeys guidance; SimpleWebAuthn documentation.
- OpenID Connect Core 1.0; RFC 7636 (PKCE); RFC 9207 (issuer identification); RFC 9700 (OAuth 2.0 Security BCP).
- NIST SP 800-63B; OWASP Authentication, Forgot Password, Session Management and Credential Stuffing cheat sheets.
- DB-IP Lite database documentation; Mailpit and Keycloak documentation.
