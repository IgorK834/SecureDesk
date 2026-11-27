# SecureDesk — Module 4 Implementation Backlog

**Theme:** Foundation and Platform ("from course project to production-grade platform")
**Application:** SecureDesk — Angular SPA + Next.js API + (SQLite today, PostgreSQL after Epic 21)
**Status:** Implementation specification / actionable product backlog, draft of 2026-11-27
**Language:** English (API error messages stay Polish and UI texts stay English, as in the existing code)
**Position in the roadmap:** Module 4 of four extension modules (4 Platform, 5 Identity, 6 Detection and response, 7 Helpdesk and data protection). Modules 5 to 7 assume the schema, test and CI conventions set here.

---

## 0. How to use this document

This backlog extends the Module 1 backlog (`docs/course/backlog.md`, SD-01 to SD-32), the Module 2 backlog (`docs/course/backlog-module-2.md`, SD-33 to SD-64) and the Module 3 backlog (`docs/course/backlog-module-3.md`, SD-65 to SD-92). It continues the numbering: **SD-93 to SD-123**, epics **19 to 24**, task IDs **Task 19.1 to Task 24.5**. The layout of every item (objective, implementation checklist, acceptance criteria, dependencies, size) is the same as in Modules 2 and 3 so the GitHub issue script can be generated from this file the same way. One GitHub milestone covers the whole module; epics are labels.

Unlike Modules 1 to 3, there is no external assignment behind this module. Its requirements come from a portfolio and production-readiness goal, so the provenance tags are different.

### Requirement provenance

| Tag            | Meaning                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `[FOUNDATION]` | Needed so that the repository can be built, reviewed, released and extended by someone else            |
| `[STANDARD]`   | Follows a named standard or framework (OWASP ASVS, SLSA, OpenAPI, OpenTelemetry, RFC 9110 and similar) |
| `[HARDENING]`  | Security measure beyond the existing controls                                                          |
| `[DESIGN]`     | Project decision to make the feature cohesive, demonstrable and extensible                             |
| `[PORTFOLIO]`  | Mainly improves how the project demonstrates skills; no runtime behaviour                              |

### Priorities and sizes

| Priority         | Meaning                                             | Completion expectation                       |
| ---------------- | --------------------------------------------------- | -------------------------------------------- |
| P0 — Required    | Indispensable foundation for this or a later module | Must be implemented for Module 4 completion  |
| P1 — Recommended | Strong value, supports the P0 story or hardens it   | Implement after or alongside related P0 work |
| P2 — Optional    | Nice to have                                        | Only when P0 and P1 are done                 |

Size scale: **S** up to 1 person-day, **M** 1–2, **L** 3–5, **XL** more than 5.

---

## 1. Goals and scope

### 1.1 Goals

1. Make the repository look and behave like a maintained open-source project: history, licence, security policy, CI, releases, decision records.
2. Remove the documented single-process limits: replace SQLite with PostgreSQL and the in-memory limiter with a shared Redis store.
3. Add a supported integration surface: a versioned OpenAPI contract, scoped API keys and signed outbound webhooks.
4. Prove the security claims in a pipeline: static analysis, secret scanning, dependency and image scanning, DAST, signed images, SBOM.
5. Add production concerns the course never needed: TLS and browser security headers for the SPA, observability, an ASVS mapping, ticket audit events.

### 1.2 In scope

- Epic 19 Repository foundation, Epic 20 CI and DevSecOps pipeline, Epic 21 PostgreSQL migration, Epic 22 Redis shared state, Epic 23 Public API and API keys, Epic 24 Production hardening.

### 1.3 Out of scope

- New end-user features (Modules 5 to 7).
- A hosted public demo and any paid service. Everything runs locally or in GitHub Actions free tiers.
- Rewriting the Angular frontend or replacing Next.js. The split architecture stays (record as ADR in SD-96).
- Multi-region or high-availability database topology. One Postgres instance plus one Redis instance is the target.

### 1.4 What already exists and how Module 4 changes it

| Existing                                                                                                  | Change in Module 4                                                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Module 2 and 3 work is uncommitted in the working tree (about 50 modified and 30 untracked files)         | SD-93 commits it in reviewable slices and cleans the root                                    |
| `better-sqlite3`, synchronous `db.transaction`, SQLite triggers, `AUTOINCREMENT`, `timestamp_ms` integers | Epic 21: async `pg` pool, PL/pgSQL triggers and privileges, `timestamptz`, `bigint identity` |
| `SlidingWindowRateLimiter` in `server/security/rate-limiter.ts` (in-memory, synchronous)                  | Epic 22: async limiter interface with a Redis implementation and an in-memory test double    |
| Process-local CAPTCHA circuit breaker, TOTP accepted-step marker kept in a column                         | SD-112: breaker state in Redis; replay marker stays in the database (authoritative)          |
| No CI, no licence, no container image, no release                                                         | Epics 19 and 20                                                                              |
| API headers set in `apps/backend/next.config.ts`; SPA has none                                            | SD-119: reverse proxy with CSP, HSTS and friends for the SPA                                 |
| README states ticket create, assign and status changes are not audited                                    | SD-120 adds those events                                                                     |
| `docs/testing.md` lists SEC-01 to SEC-96                                                                  | This module adds SEC-97 to SEC-118                                                           |

---

## 2. Architecture and conventions

### 2.1 Target runtime topology

```text
 Browser ──HTTPS──▶ Caddy (TLS, HSTS, CSP for the SPA, XFF overwrite)
                      ├── /            ▶ Angular static files (immutable, hashed assets)
                      └── /api/*       ▶ Next.js API  (apps/backend, :3000)
                                            ├── PostgreSQL 17   (data, audit log, sessions)
                                            ├── Redis 8         (rate limits, breaker, pub/sub)
                                            └── OTLP / Prometheus (traces, metrics)
```

### 2.2 Conventions inherited from Modules 1 to 3 (unchanged)

Strict TypeScript; Zod strict schemas for every body; `defineRoute` with an explicit authentication option; permission matrix in `permissions/matrix.ts` and `docs/permissions.md` kept in sync by a test; injected clock; Polish API messages and English UI; Vitest with an 80% coverage gate; Playwright with an isolated E2E database; `scripts/check-sec-traceability.ts` ties every `SEC-nn` to a real test title; no schema change outside versioned migrations.

### 2.3 Conventions added by this module

- **Everything database-related is asynchronous.** No synchronous driver remains after SD-106. A transaction is `await db.transaction(async (tx) => …)`; the audit helper takes the `tx` handle exactly as before.
- **Two database roles.** `securedesk_migrator` owns the schema and runs migrations. `securedesk_app` has only `SELECT`, `INSERT`, `UPDATE`, `DELETE` where needed and **no** `UPDATE`, `DELETE` or `TRUNCATE` on `audit_log`.
- **One migration history.** The SQLite history (`0000` to `0009`) is frozen under `apps/backend/src/server/db/migrations-sqlite-legacy/` and used only by the one-off data-migration tool (SD-109). A new Postgres baseline starts a fresh numbered history.
- **Shared-state access goes through interfaces** (`RateLimitStore`, `EventBus`) with a Redis implementation and an in-memory implementation for unit tests.
- **Fail policy per dependency.** Postgres down: `503` for everything. Redis down: security-critical limiters **fail closed** (`503 SERVICE_UNAVAILABLE` before any credential check); read-only endpoints and the health endpoint continue. Decision D4-04.
- **Every new route and permission** appears in the permission doc, the OpenAPI document and the audit coverage guard.

### 2.4 New configuration (`.env.example`)

```bash
# PostgreSQL (SD-104). DATABASE_PATH and friends are removed in SD-106.
DATABASE_URL=postgres://securedesk_app:change-me@localhost:5432/securedesk
DATABASE_MIGRATOR_URL=postgres://securedesk_migrator:change-me@localhost:5432/securedesk
# Redis (SD-110)
REDIS_URL=redis://localhost:6379
# Public API (SD-114, SD-116). Pepper is mixed into API key digests; webhook secrets are encrypted with TOTP_ENCRYPTION_KEY's successor in Module 7.
API_KEY_PEPPER=replace-with-output-of-openssl-rand-base64-32
# Metrics (SD-121). Prometheus scrapes with this bearer token; the endpoint is also bound to an internal interface only.
METRICS_TOKEN=replace-with-output-of-openssl-rand-base64-32
OTEL_EXPORTER_OTLP_ENDPOINT=
# Test-only: allow webhook targets on loopback. Refused when NODE_ENV=production.
# WEBHOOK_ALLOW_LOOPBACK=true
```

### 2.5 Standards covered

OWASP ASVS 5.0 (V1 architecture, V3 session, V4 access control, V13 API, V14 configuration), OWASP Top 10 A05 Security Misconfiguration, A06 Vulnerable Components, A08 Software and Data Integrity Failures, SLSA level 2 or 3 build provenance, NIST SSDF PW and PS practices, OpenAPI 3.1, W3C Trace Context.

---

## 3. Data model additions

| Table                   | Columns (summary)                                                                                                                                                                          | Notes                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `api_keys`              | `id uuid`, `user_id`, `name`, `prefix` (first 8 chars, unique), `secret_digest` (SHA-256 of pepper plus secret), `scopes text[]`, `expires_at`, `last_used_at`, `revoked_at`, `created_at` | The secret is shown once. 256-bit random secret so a fast hash is sufficient   |
| `webhook_subscriptions` | `id`, `user_id`, `url`, `event_types text[]`, `secret_encrypted`, `enabled`, `consecutive_failures`, `disabled_reason`, `created_at`                                                       | Secret encrypted with the TOTP-style envelope (key rotation arrives in SD-192) |
| `webhook_deliveries`    | `id`, `subscription_id`, `event_id`, `event_type`, `attempt`, `status`, `http_status`, `next_attempt_at`, `error_class`, `created_at`                                                      | No response bodies stored; dead-letter is `status = 'DEAD'`                    |

Invariants: an API key never carries more scopes than its owner's permissions at the moment of **use**; a webhook payload never contains ticket title or description, only identifiers, status and event type.

---

## 4. Permission additions

| Code                  | Meaning                                                                 | Roles                    |
| --------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `api-keys:manage-own` | Create, list (metadata only) and revoke the caller's own API keys       | Manager, Employee, Guest |
| `webhooks:manage-own` | Manage the caller's own webhook subscriptions and read their deliveries | Manager, Employee, Guest |

Decision D4-05: the Administrator receives neither. The Administrator has no ticket access by design, and API keys in v1 carry **ticket scopes only**; no key can hold a `users:*`, `security-*`, `audit-log:*`, `api-keys:*` or `webhooks:*` permission.

---

## 5. API contract

### 5.1 New endpoints

| Method and path                                 | Purpose                                     | Permission / auth                               |
| ----------------------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `GET /api/v1/openapi.json`                      | OpenAPI 3.1 document of the versioned API   | Public, cacheable                               |
| `GET /api/me/api-keys`                          | List own keys (prefix, name, scopes, dates) | `api-keys:manage-own`                           |
| `POST /api/me/api-keys`                         | Create a key; the secret is returned once   | `api-keys:manage-own`                           |
| `DELETE /api/me/api-keys/{id}`                  | Revoke                                      | `api-keys:manage-own`                           |
| `GET/POST/PATCH/DELETE /api/me/webhooks[/{id}]` | Manage subscriptions                        | `webhooks:manage-own`                           |
| `GET /api/me/webhooks/{id}/deliveries`          | Delivery log                                | `webhooks:manage-own`                           |
| `GET /api/metrics`                              | Prometheus text format                      | Bearer `METRICS_TOKEN`, internal interface only |

### 5.2 Versioning rule

Existing routes stay at `/api/...` for the SPA. The documented, stable surface for integrations is `/api/v1/tickets` (a thin alias that uses the same handlers). Breaking changes require `/api/v2`. Decision D4-06.

### 5.3 Error codes added

`SERVICE_UNAVAILABLE` (503, shared-state outage), `API_KEY_INVALID` (401), `API_KEY_SCOPE_DENIED` (403), `WEBHOOK_TARGET_REFUSED` (422), `MIXED_CREDENTIALS` (400).

---

## 6. Detailed implementation backlog

### Task ID map

| Epic                         | Tasks                                                                                                |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| 19 Repository Foundation     | 19.1 = SD-93, 19.2 = SD-94, 19.3 = SD-95, 19.4 = SD-96                                               |
| 20 CI and DevSecOps Pipeline | 20.1 = SD-97, 20.2 = SD-98, 20.3 = SD-99, 20.4 = SD-100, 20.5 = SD-101, 20.6 = SD-102, 20.7 = SD-103 |
| 21 PostgreSQL Migration      | 21.1 = SD-104, 21.2 = SD-105, 21.3 = SD-106, 21.4 = SD-107, 21.5 = SD-108, 21.6 = SD-109             |
| 22 Redis Shared State        | 22.1 = SD-110, 22.2 = SD-111, 22.3 = SD-112, 22.4 = SD-113                                           |
| 23 Public API and API Keys   | 23.1 = SD-114, 23.2 = SD-115, 23.3 = SD-116, 23.4 = SD-117, 23.5 = SD-118                            |
| 24 Production Hardening      | 24.1 = SD-119, 24.2 = SD-120, 24.3 = SD-121, 24.4 = SD-122, 24.5 = SD-123                            |

---

## EPIC 19 — Repository foundation

### SD-93 / Task 19.1 — Commit pending work and organise the repository

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], docs, repo · **Depends on:** none

**Objective:** The public history ends at the audit-verify commit while Modules 2 and 3 (detection rules, Loki shipping, webhooks, observability, reports, evidence) exist only as uncommitted files. Land them as reviewable commits, and move coursework artefacts out of the root so the repository tells a clean story.

**Implementation checklist**

- Split the working tree into logical conventional commits (schema and migrations, backend services, routes, frontend, tests, docs, evidence). Run `npm run lint && npm run typecheck && npm test` before pushing the series; no commit leaves the tree red where avoidable.
- Move `create_issues_module_3.sh` and later issue scripts to `scripts/issues/`; move `docs/backlog*.md`, `docs/report*.md` and the Polish reports to `docs/course/`; update every relative link (README, docs, `check-image-locations.ts`).
- Add `output/` to `.gitignore` except a documented `output/.gitkeep`; remove `output/pdf/SecureDesk-raport.pdf` from tracking (attach it to a release instead). Never track the course assignment PDF (`Cyberbezpieczenstwo_3.pdf`); add it to `.gitignore` explicitly.
- Delete `scripts/__pycache__/`, `tmp/`, and add them to `.gitignore`. Decide whether `AGENTS.md` and `CLAUDE.md` stay public and commit or ignore them.
- Check that `git ls-files` contains no secret, database, credential file or personal data (`.env`, `*.sqlite*`, `initial-credentials.txt`).

**Acceptance criteria**

- [ ] `git status` is clean on `main` after merge; `git log` shows the Module 2 and 3 work as separate conventional commits.
- [ ] Repository root contains only configuration, `apps/`, `docs/`, `scripts/`, `tests/`, `observability/` and top-level project files.
- [ ] `npm run check:image-locations`, `npm run format:check`, `npm test` pass after the moves; no broken relative links (checked with a link checker in SD-97).
- [ ] No assignment PDF or generated report is tracked.
- [ ] Minimum 80% test coverage for this module (no new code; gate stays green).

### SD-94 / Task 19.2 — Licence, security policy and contribution files

**Priority:** P0 · **Size:** S · **Labels:** [FOUNDATION], docs, repo · **Depends on:** SD-93

**Objective:** Give strangers the legal and procedural basics: what they may do with the code, how to report a vulnerability, how to contribute.

**Implementation checklist**

- `LICENSE` (MIT) with the author's name and year; `package.json` `license` fields.
- `SECURITY.md`: supported versions, private reporting through GitHub Security Advisories, expected response times, scope (the app, not third-party services), safe-harbour wording.
- `CONTRIBUTING.md`: setup, branch and commit conventions (conventional commits already in use), how to run the checks, how to add a SEC test (traceability rule), Definition of Done link.
- `.github/ISSUE_TEMPLATE/` (bug, feature, security-hardening), `PULL_REQUEST_TEMPLATE.md` with the DoD checklist, `CODEOWNERS`.
- Document, as a manual step in `docs/repo-settings.md`, the GitHub repository settings to apply: description, topics (`cybersecurity`, `rbac`, `audit-log`, `angular`, `nextjs`, `owasp`, `siem`), branch protection with required status checks, secret scanning and push protection, private vulnerability reporting.

**Acceptance criteria**

- [ ] `gh repo view` shows a detected licence after merge; the Security tab shows the policy.
- [ ] Issue and PR templates appear in the GitHub UI.
- [ ] `docs/repo-settings.md` lists every setting with the exact toggle name.
- [ ] Minimum 80% test coverage for this module (documentation task).

### SD-95 / Task 19.3 — README restructure and architecture diagram

**Priority:** P0 · **Size:** M · **Labels:** [PORTFOLIO], [FOUNDATION], docs · **Depends on:** SD-93

**Objective:** The current README (about 25 KB) opens with a tutorial. A reviewer decides in a minute. Lead with the pitch, evidence and a diagram; move reproduction steps into `docs/`.

**Implementation checklist**

- Top section: one-paragraph pitch, badges (CI, coverage, licence, last release), a short feature list grouped by area, a 3-line quick start (after SD-102 `docker compose up`), the demo preview and recording link.
- A "Security controls at a glance" table: control, where implemented, test IDs (generated from `docs/testing.md` by a small script to avoid drift).
- Replace the placeholder architecture note ("Diagram derived from the SD-01 task description…") with a Mermaid diagram of the topology in section 2.1 and a second one for the login pipeline; fix the stale "tests/ (added in later tasks)" layout line.
- Move "Reproduce the Module 2 / Module 3 demonstration", report building, and database commands to `docs/running.md`, `docs/demos.md`; keep links.
- Keep the honest "not production-certified" statement once, in a "Status and limitations" section.

**Acceptance criteria**

- [ ] README is under 200 lines and renders both Mermaid diagrams on GitHub.
- [ ] All links resolve (link checker in CI); the quick start works from a clean clone.
- [ ] Every claim in the README is backed by a link to code or a test ID.
- [ ] Minimum 80% test coverage for this module (documentation task).

### SD-96 / Task 19.4 — Architecture decision records

**Priority:** P1 · **Size:** S · **Labels:** [PORTFOLIO], [FOUNDATION], docs · **Depends on:** SD-93

**Objective:** Record why the system is the way it is. ADRs are a cheap, strong signal of engineering maturity and give interviewers specific things to discuss.

**Implementation checklist**

- `docs/adr/0000-template.md` (MADR format) and an index `docs/adr/README.md`.
- Retroactive ADRs: split Angular SPA and Next.js API; server-side revocable cookie sessions over JWT; Argon2id parameters; CSRF with Origin check plus HMAC double submit; SHA-256 chain with head anchor; process-local limiter (superseded later); SQLite choice (superseded by SD-104).
- New ADRs written while building this module: PostgreSQL only with Testcontainers; Redis fail-closed policy; API keys limited to ticket scopes; webhook SSRF policy.
- Link ADRs from the README and from the relevant backlog tasks.

**Acceptance criteria**

- [ ] At least eight ADRs with status, context, decision, consequences; superseded ones point to their successors.
- [ ] A markdown lint step (SD-97) validates the ADR front matter.
- [ ] Minimum 80% test coverage for this module (documentation task).

---

## EPIC 20 — CI and DevSecOps pipeline

### SD-97 / Task 20.1 — CI workflow: lint, typecheck, format, unit and integration tests

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], devops, testing · **Depends on:** SD-93

**Objective:** Every push and pull request runs the same checks as `npm test` locally, and `main` is protected by them.

**Implementation checklist**

- `.github/workflows/ci.yml`: Node from `.nvmrc`, `npm ci` with cache, jobs `lint`, `typecheck`, `format`, `test` (runs `npm test` including the SEC traceability and image checks and the coverage gate), `links` (lychee over README and docs), `adr-lint`.
- Upload the coverage report as an artifact and publish a coverage badge (shields endpoint through a gist, or the Actions summary).
- Pin third-party actions by commit SHA; set `permissions: contents: read` at the top and widen per job only when needed; concurrency group cancels superseded runs.
- Add a status badge to the README; configure the required checks in `docs/repo-settings.md`.
- After SD-108 the `test` job gains a PostgreSQL service container; until then it runs on SQLite.

**Acceptance criteria**

- [ ] A pull request that breaks a test, a lint rule, formatting or coverage fails the workflow and cannot be merged.
- [ ] A fresh run completes in under 10 minutes with a warm cache.
- [ ] Every action reference is a full SHA with a version comment; workflow token permissions are least-privilege.
- [ ] Minimum 80% test coverage for this module (pipeline task; coverage gate itself is the verification).

### SD-98 / Task 20.2 — Playwright E2E in CI

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], devops, testing · **Depends on:** SD-97

**Objective:** Run the browser journeys of Modules 1 to 3 on every pull request, with artifacts that make failures diagnosable.

**Implementation checklist**

- Job `e2e` installing Chromium via `npx playwright install --with-deps chromium`, running `npm run test:e2e:module2` and `npm run test:e2e:module3` with zero retries as the scripts already require; the `@slow` idle-timeout spec runs on `main` and nightly only.
- Upload Playwright HTML report, traces and videos on failure; keep 14 days.
- Shard the suite when it exceeds 8 minutes; keep the test database per shard isolated (`E2E_DATABASE_PATH` per shard until SD-108, a database per shard afterwards).
- Cache the Playwright browser directory keyed by version.

**Acceptance criteria**

- [ ] The E2E job is a required check on `main`.
- [ ] A deliberately failing spec uploads a trace that opens locally.
- [ ] Two consecutive runs on the same commit give the same result (no flakiness introduced by CI timing).
- [ ] Minimum 80% test coverage for this module (pipeline task).

### SD-99 / Task 20.3 — Static analysis and secret scanning

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], [STANDARD], devops, security · **Depends on:** SD-97

**Objective:** Catch vulnerable code patterns and committed secrets automatically.

**Implementation checklist**

- `.github/workflows/codeql.yml`: CodeQL for `javascript-typescript`, on pull requests, pushes to `main` and weekly; query suite `security-extended`.
- gitleaks: a workflow scanning the full history on `main` and the diff on pull requests, plus `.gitleaks.toml` with an allowlist for documented placeholder values in `.env.example` and test fixtures (each entry commented). Provide an optional local pre-commit hook script.
- Add `eslint-plugin-security` (or equivalent flat-config rules) for `detect-child-process`, `detect-non-literal-fs-filename`, `detect-unsafe-regex`; justify any disabled rule inline.
- Triage first findings: fix, or suppress with a written reason in `docs/security-triage.md`.

**Acceptance criteria**

- [ ] CodeQL results appear in the Security tab; no open high or critical alert without a triage entry.
- [ ] A test commit containing a fake AWS key (outside the allowlist) fails the gitleaks job (demonstrated once, evidence in the PR).
- [ ] `npm run lint` includes the security rules and passes.
- [ ] Minimum 80% test coverage for this module (pipeline task).

### SD-100 / Task 20.4 — Dependency and supply-chain checks

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], [STANDARD], devops, security · **Depends on:** SD-97

**Objective:** Know what is in the build, and fail when a known-vulnerable dependency enters.

**Implementation checklist**

- `.github/dependabot.yml`: npm (grouped minor and patch updates, weekly), GitHub Actions, and Docker (after SD-101).
- CI step `npm audit --omit=dev --audit-level=high` with an allowlist file `audit-allowlist.json` whose entries need an advisory ID, reason and expiry date; a script fails when an entry expires.
- OSV-Scanner over `package-lock.json`.
- Generate a CycloneDX SBOM (`@cyclonedx/cyclonedx-npm`) per release and as a CI artifact; verify with a schema validator.
- Lockfile hygiene check: `npm ci` fails on drift; a script rejects `resolutions` of unexpected registries and install scripts of new dependencies (list allowed ones).

**Acceptance criteria**

- [ ] Dependabot opens grouped pull requests; CI runs on them.
- [ ] Adding a dependency with a known high advisory fails the job (demonstrated once).
- [ ] An SBOM artifact is produced for every `main` build and validates against the CycloneDX schema.
- [ ] Minimum 80% test coverage for this module (pipeline task; the allowlist expiry script is unit tested).

### SD-101 / Task 20.5 — Container images and one-command demo stack

**Priority:** P0 · **Size:** L · **Labels:** [FOUNDATION], [HARDENING], devops · **Depends on:** SD-97, SD-104

**Objective:** Anyone can run the whole system with `docker compose up`, using hardened images.

**Implementation checklist**

- `apps/backend/Dockerfile`: multi-stage, `node:24-slim`, `npm ci --omit=dev` for the runtime stage, Next.js standalone output, native modules (`argon2`) built in the build stage, non-root user, read-only root filesystem with explicit writable volumes (`/data/audit`, `/data/alerts`), `HEALTHCHECK` on `/api/health`.
- `apps/frontend/Dockerfile`: build stage then Caddy serving the static files (reused by SD-119).
- `docker-compose.yml` for the full stack: `postgres`, `redis`, `migrate` (one-shot, migrator role), `seed` (demo accounts, passwords written to a mounted volume, never the log), `backend`, `frontend`, optional profiles `observability` (existing Loki and Grafana), `idp` (Keycloak, Module 5), `mail` (Mailpit), `av` (ClamAV, Module 7).
- Image scan with Trivy in CI (fail on high or critical with a fixable version); also scan the Dockerfile with hadolint.
- Document secrets handling: compose reads from an untracked `.env.compose`; no secret baked into an image layer (verified with `docker history`).

**Acceptance criteria**

- [ ] `docker compose up --build` from a clean clone produces a working app at `https://localhost` (or `http://localhost:8080` without TLS profile) with seeded demo data.
- [ ] Containers run as non-root with `read_only: true` and `cap_drop: [ALL]` (SEC-118 smoke test).
- [ ] Trivy and hadolint pass in CI.
- [ ] Image size of the backend runtime is documented and below 400 MB.
- [ ] Minimum 80% test coverage for this module (infrastructure task; smoke script in CI).

### SD-102 / Task 20.6 — DAST: OWASP ZAP baseline scan

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING], [STANDARD], devops, security · **Depends on:** SD-101

**Objective:** Run a dynamic scan against the composed stack and publish the report as evidence.

**Implementation checklist**

- Workflow job that starts the compose stack with the E2E fixture accounts, runs `zaproxy` baseline scan on the SPA and an API scan against `/api/v1/openapi.json` (after SD-114; baseline only before that).
- ZAP context with authenticated session script for one Guest and one Manager (logins from the CI-generated fixtures; no real credentials).
- Fail on new high alerts; keep an `zap-rules.tsv` of accepted alerts with a reason.
- Upload the HTML report as an artifact and link the latest one from `docs/security-evidence/`.

**Acceptance criteria**

- [ ] A scan runs on `main` weekly and on demand; the report is downloadable.
- [ ] No high alert is open without an entry in `zap-rules.tsv`.
- [ ] The scan never targets anything but the compose stack of the job (host allowlist in the script).
- [ ] Minimum 80% test coverage for this module (pipeline task).

### SD-103 / Task 20.7 — Release pipeline: signed images, provenance and Helm chart

**Priority:** P1 · **Size:** L · **Labels:** [STANDARD], [PORTFOLIO], devops, security · **Depends on:** SD-101

**Objective:** A tagged release produces verifiable artifacts: signed images, an SBOM attached to them, SLSA provenance, a Helm chart, and release notes.

**Implementation checklist**

- Workflow on tag `v*`: build and push images to GHCR, sign with cosign keyless (GitHub OIDC), attach the CycloneDX SBOM as an attestation, generate SLSA provenance (`slsa-github-generator`), create a GitHub Release with notes from conventional commits and attach the audit report PDF.
- `deploy/helm/securedesk/`: Deployments for backend and frontend, Service, Ingress, `ConfigMap` for non-secret settings, secrets referenced from an existing `Secret` (no secrets in values), liveness and readiness probes, `securityContext` (non-root, read-only root FS, drop all capabilities), `NetworkPolicy` (frontend to backend to Postgres and Redis only), `PodDisruptionBudget`.
- CI: `helm lint`, `kubeconform` against the Kubernetes schema, and a `kind` smoke job installing the chart with bundled Postgres and Redis subcharts.
- `docs/release.md`: how to verify a signature (`cosign verify`) and provenance (`slsa-verifier`).

**Acceptance criteria**

- [ ] Tagging `v0.2.0` on a fork produces a signed image that `cosign verify` accepts with the documented identity.
- [ ] `helm install` on `kind` brings the app to ready and `curl /api/health` returns `200`.
- [ ] `kubeconform` and `helm lint` pass; the chart contains no plaintext secret.
- [ ] Minimum 80% test coverage for this module (pipeline task).

---

## EPIC 21 — PostgreSQL migration

### SD-104 / Task 21.1 — Decision record, Postgres infrastructure and Testcontainers harness

**Priority:** P0 · **Size:** M · **Labels:** [DESIGN], [FOUNDATION], database, devops · **Depends on:** SD-96, SD-97

**Objective:** Make Postgres available for development, tests and CI before any code is ported, and record the decision (PostgreSQL only; SQLite is dropped, D4-01).

**Implementation checklist**

- ADR `0010-postgresql-only.md` with the trade-offs: lost zero-setup demo, replaced by `docker compose up`; single dialect keeps one migration history and one trigger implementation.
- Compose service `postgres:17` with a named volume, healthcheck, and an init script creating the roles `securedesk_migrator` and `securedesk_app` with separate passwords.
- Dev scripts: `npm run db:up`, `db:down`, `db:psql`.
- Test harness `tests/support/postgres.ts` based on `@testcontainers/postgresql`: one container per Vitest run (global setup), a template database migrated once, and a fresh database cloned from the template per test file (`CREATE DATABASE … TEMPLATE`), dropped afterwards.
- Config module reading `DATABASE_URL` and `DATABASE_MIGRATOR_URL`, validated at start-up; production refuses a superuser or a migrator URL for the app.

**Acceptance criteria**

- [ ] `npm run db:up` starts Postgres; the two roles exist with the documented privileges.
- [ ] A sample Vitest file obtains an isolated, migrated database in under 2 seconds after the template exists.
- [ ] Start-up refuses a missing `DATABASE_URL`, and in production refuses a URL whose role can create tables.
- [ ] Minimum 80% test coverage for this module.

### SD-105 / Task 21.2 — Port the schema to Drizzle `pg-core` with a baseline migration

**Priority:** P0 · **Size:** L · **Labels:** [DESIGN], database · **Depends on:** SD-104

**Objective:** Express every table in `apps/backend/src/server/db/schema/` for Postgres with proper types and constraints, and create a clean baseline migration.

**Implementation checklist**

- Convert each schema file: `integer(mode: timestamp_ms)` to `timestamp(…, { withTimezone: true, mode: 'date' })`; `integer(mode: boolean)` to `boolean`; text IDs that are UUIDs to `uuid`; `AUTOINCREMENT` audit `seq` to `bigint generated always as identity`; JSON-in-text columns to `jsonb` where the code already stores JSON; CHECK constraints preserved; enum-like checks may become `CHECK` on `text` (keep the closed-list behaviour, no native enums, so adding a value is a simple migration).
- Case-insensitive uniqueness of `login_normalized` stays a plain unique index on the normalised value (no `citext`).
- Freeze the old migrations to `migrations-sqlite-legacy/`; generate `0000_pg_baseline` with `drizzle-kit` and review the SQL by hand.
- Update `docs/database-schema.md` and `.mmd`, and the ER-diagram test (`er-diagram.test.ts`) to the new types.
- Add schema tests: every FK has an index where queried; every `timestamptz` column is `NOT NULL` unless documented.

**Acceptance criteria**

- [ ] The baseline migration applies to an empty Postgres and produces a schema equivalent to the SQLite one (table and column list compared by a script).
- [ ] The ER diagram and `docs/database-schema.md` match the schema (test green).
- [ ] No column of the old schema is silently dropped (the comparison script lists every difference with a reason).
- [ ] Minimum 80% test coverage for this module.

### SD-106 / Task 21.3 — Asynchronous data layer and service conversion

**Priority:** P0 · **Size:** XL · **Labels:** [DESIGN], backend, database · **Depends on:** SD-105

**Objective:** Replace `better-sqlite3`, whose synchronous transactions the code relies on (for example "no `await` between the read and the insert" in `audit/append.ts`), with an async `pg` pool, and convert every caller.

**Implementation checklist**

- `db/connection.ts` and `db/client.ts`: `pg.Pool` with sensible limits (`max`, `idleTimeoutMillis`, `statement_timeout`), `drizzle-orm/node-postgres`, graceful shutdown in `instrumentation.ts`.
- Convert, in this order: `permissions`, `users`, `auth` (login, password, session, TOTP services), `security` (settings, events, attempt tracker, IP blocks, honeytokens), `tickets`, `audit`, `detection`, `maintenance`, route handlers, `defineRoute`, seeds, CLI scripts (`audit-verify`, `audit-tamper-demo`, `purge`, `admin-unlock`).
- Keep the transaction-handle convention: services accept `tx` so the audit entry and the change commit together; add an `await`-safe `withTransaction(db, fn)` helper that retries on serialization failures (`40001`) and deadlocks (`40P01`) up to three times.
- Replace SQLite-specific SQL (`INSERT OR IGNORE`, `RAISE(ABORT)`, `PRAGMA`, `sqlite_sequence`, `json_extract`) with Postgres equivalents (`ON CONFLICT`, `jsonb` operators). Update `security/sql-lint.test.ts` so the lint rule still rejects `sql.raw` and interpolated SQL outside migrations.
- Remove `better-sqlite3` and `@types/better-sqlite3`; remove `DATABASE_PATH`, `TEST_DATABASE_PATH`, `E2E_DATABASE_PATH` from `.env.example` and the docs.

**Acceptance criteria**

- [ ] `grep -r "better-sqlite3" apps scripts tests` returns nothing; `npm run typecheck` is green.
- [ ] Every previously passing unit and integration test passes unchanged in intent (assertions may change only where SQLite semantics differed, each listed in the PR).
- [ ] A `withTransaction` test proves retry on `40001` and `40P01` and no retry on constraint violations.
- [ ] The SQL lint rule still fails on `sql.raw` and string-interpolated SQL.
- [ ] Minimum 80% test coverage for this module.

### SD-107 / Task 21.4 — Port protection logic: audit immutability, admin protection, chain locking, atomic counters

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], database, security · **Depends on:** SD-106

**Objective:** Re-establish, on Postgres, every guarantee that SQLite triggers and single-process synchronous transactions gave implicitly.

**Implementation checklist**

- Migration with `audit_log` triggers (`BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE`, PL/pgSQL `RAISE EXCEPTION 'audit_log is append-only'`) **and** privilege revocation: `securedesk_app` has `INSERT, SELECT` only on `audit_log`; `ALTER TABLE … OWNER` stays with the migrator.
- Port the protected-ADMIN triggers of `0001_protect_admin_account.sql` (no block, delete or role change) to PL/pgSQL.
- Audit append: serialise writers with a one-row `audit_head` table locked `FOR UPDATE`, or `pg_advisory_xact_lock(hashtext('audit_log'))` (decide by benchmark, record in an ADR); read the last `(seq, entry_hash)`, insert, update head, all in the caller's transaction. Keep the canonical format `sd-audit-v1` byte-for-byte so existing chains verify.
- Head anchor advancement: only after commit (`afterCommit` hook on the transaction wrapper), never inside the transaction.
- Atomic counters: the "Nth failure locks the account" decision uses a single `UPDATE … SET failures = failures + 1 … RETURNING` plus a conditional lock, so 50 parallel attempts admit at most five credential checks across two app processes (SEC-101).
- Session revocation transactions keep `READ COMMITTED` semantics with explicit row locks where the code assumed single-writer behaviour; add a short note per place.

**Acceptance criteria**

- [ ] `UPDATE`, `DELETE` and `TRUNCATE` on `audit_log` fail for the app role with a privilege error and for the migrator with the trigger message (SEC-97, SEC-98).
- [ ] Block, delete and role change of `ADMIN` still fail at the database level (SEC-99).
- [ ] 50 concurrent appends from two pooled connections produce a gapless `seq` and a valid chain (SEC-100).
- [ ] 50 parallel wrong-password logins from two processes admit at most five credential checks (SEC-101).
- [ ] Minimum 80% test coverage for this module.

### SD-108 / Task 21.5 — Tests, E2E and CI on PostgreSQL

**Priority:** P0 · **Size:** L · **Labels:** [FOUNDATION], testing, devops · **Depends on:** SD-107, SD-98

**Objective:** The whole suite runs on Postgres locally and in CI, with isolation that keeps it fast.

**Implementation checklist**

- Vitest global setup starts one Testcontainers instance (or uses the CI service container when `DATABASE_TEST_URL` is set) and exposes the template-database helper to every test file; update `vitest.config.ts`, fixtures under `server/__fixtures__`, and the fake-clock helpers.
- Playwright `global-setup` and `setup-db.ts`: create a database per run (and per shard), migrate with the migrator role, seed, write `tests/e2e/.credentials.json` as before; `scripts/test-module3-e2e.mjs` creates and drops its temporary database.
- Persistence tests that "reopen the database" (SEC-30, SEC-59) become "restart the pool" tests.
- CI job `test` gains a `postgres:17` service; `e2e` jobs use the same.
- Update `docs/testing.md`, README and `docs/running.md`.

**Acceptance criteria**

- [ ] `npm test` and `npm run test:e2e` pass locally with only Docker installed; the run leaves no stray databases or containers.
- [ ] Test duration on CI is no more than 1.5 times the SQLite baseline.
- [ ] SEC-01 to SEC-96 still map to real test titles (traceability check green).
- [ ] Minimum 80% test coverage for this module.

### SD-109 / Task 21.6 — SQLite to PostgreSQL data migration tool and cut-over runbook

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], database, docs · **Depends on:** SD-107

**Objective:** Existing development and demo data (and the audit chain) survive the switch, and the process is a documented, repeatable runbook.

**Implementation checklist**

- `apps/backend/scripts/migrate-sqlite-to-pg.ts` (`npm run db:import:sqlite -- <path>`): opens the legacy file read-only with a throwaway `better-sqlite3` import (kept only in this script's dev dependency), copies tables in FK order inside one transaction, converts types, **preserves `seq` and every hash byte-for-byte**, and resets the identity sequence.
- After the copy: run the full chain verification and compare row counts per table; print a report and exit non-zero on any difference.
- Refuses a non-empty target. Writes one `SYSTEM` audit entry `DATA_IMPORTED` only **after** verification passes (new catalogue event).
- `docs/migration-sqlite-to-postgres.md`: backup first, stop the app, run, verify, rollback by restoring the file.

**Acceptance criteria**

- [ ] Importing the demo database yields identical row counts and `INTACT` verification (SEC-105).
- [ ] Importing a database with a tampered audit row fails with the sequence number named, and nothing is committed.
- [ ] The tool refuses to run against a non-empty target database.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 22 — Redis shared state

### SD-110 / Task 22.1 — Redis client, configuration, health and failure policy

**Priority:** P0 · **Size:** S · **Labels:** [DESIGN], backend, devops · **Depends on:** SD-104

**Objective:** One audited way to talk to Redis, with a defined behaviour when it is unavailable.

**Implementation checklist**

- `server/shared-state/redis.ts` using `ioredis`: single client per process, connection and command timeouts, no unbounded offline queue, TLS option, reconnect with capped backoff.
- `/api/health` reports `postgres` and `redis` separately (still `200` only if both are up for readiness; a new `/api/health/live` is liveness only).
- Failure policy implemented as a function `sharedStatePolicy(feature)`: `failClosed` for login, password change, TOTP and reset limiters; `failOpenLogged` for non-security caches. The decision table lives in the ADR (D4-04).
- Redis compose service (`redis:8-alpine`, no persistence needed for limiter state, `requirepass`).

**Acceptance criteria**

- [ ] With Redis stopped, a login request returns `503 SERVICE_UNAVAILABLE` before verifying credentials (SEC-103) and the health endpoint reports the failing dependency.
- [ ] Commands never hang longer than the configured timeout.
- [ ] `.env.example`, compose and docs list `REDIS_URL`.
- [ ] Minimum 80% test coverage for this module.

### SD-111 / Task 22.2 — Shared sliding-window rate limiter

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, security · **Depends on:** SD-110, SD-106

**Objective:** Replace the process-local `SlidingWindowRateLimiter` so limits hold across instances and restarts.

**Implementation checklist**

- Introduce `interface RateLimitStore { consume; check; record; clear }` (async). Keep the current class as `InMemoryRateLimitStore` for unit tests; add `RedisRateLimitStore` using a sorted set per key and a Lua script so check-and-record is atomic (SEC-36 semantics).
- Key naming: `rl:{purpose}:{ip-bucket-or-login-hash}`; never store raw logins (use the existing keyed hash); TTL equals the window.
- Update all call sites (`attempt-tracker`, `login-guard`, `ip-block-service`, honeytoken and webhook routes) to `await`.
- Time comes from the Redis server clock inside the Lua script (`TIME`) in production and from the injected clock in tests via a parameter, so fake-clock tests still work.
- Document the migration of Module 1 and 2 behaviour (SEC-27, SEC-36, SEC-55 to SEC-57) in `docs/architecture.md`.

**Acceptance criteria**

- [ ] The sixth failed login is throttled identically for known and unknown logins when requests alternate between two backend processes (SEC-102).
- [ ] A 50-request parallel burst across two processes admits at most five credential checks (SEC-101).
- [ ] Restarting the backend does not reset limits (state lives in Redis).
- [ ] No raw login or IP appears in a Redis key (checked by scanning keys in a test).
- [ ] Minimum 80% test coverage for this module.

### SD-112 / Task 22.3 — Shared CAPTCHA circuit breaker and replay markers

**Priority:** P1 · **Size:** M · **Labels:** [HARDENING], backend, security · **Depends on:** SD-111

**Objective:** The README lists the "process-local CAPTCHA circuit breaker" as a documented limitation. Remove it, and decide where each replay marker authoritatively lives.

**Implementation checklist**

- Breaker state (consecutive Turnstile failures, open-until) in Redis with atomic Lua updates; fallback mode semantics of `CAPTCHA_FALLBACK=internal` unchanged.
- One-time CAPTCHA challenge consumption stays in the database (authoritative, transactional); a Redis short-TTL "seen token" set is added only as a fast-path cache for Turnstile token replay.
- TOTP accepted-step marker (`users.totp_last_used_step`) stays in the database; add a regression test that two instances cannot both accept the same code.
- Update `docs/architecture.md`, the threat model and the README "Current status".

**Acceptance criteria**

- [ ] After five Turnstile failures observed by instance A, instance B serves the fallback (or fails closed) without its own five failures (SEC-104).
- [ ] The same TOTP code submitted concurrently to two instances is accepted once.
- [ ] A replayed Turnstile token is refused even when it reaches a different instance.
- [ ] Minimum 80% test coverage for this module.

### SD-113 / Task 22.4 — Event bus abstraction on Redis pub/sub

**Priority:** P1 · **Size:** M · **Labels:** [DESIGN], backend · **Depends on:** SD-110

**Objective:** Provide the publish and subscribe primitive that Modules 6 and 7 need (SOAR triggers, real-time stream) without committing them to Redis directly.

**Implementation checklist**

- `server/shared-state/event-bus.ts`: `interface EventBus { publish(topic, event); subscribe(topic, handler): Unsubscribe }`; Redis implementation on `PUBLISH` with a dedicated subscriber connection; in-process implementation for tests.
- Event envelope: `{ id (uuid v7), type, occurredAt, payload }` with a Zod schema per type; payloads carry identifiers only.
- At-most-once delivery is the documented guarantee; durable delivery arrives with the transactional outbox in SD-180.
- Metrics counters for published and handled events (SD-121).

**Acceptance criteria**

- [ ] A subscriber in process B receives events published by process A, in order for a single publisher.
- [ ] An invalid envelope is dropped, counted and logged without a payload dump.
- [ ] Unsubscribing releases the handler; a handler that throws does not stop others.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 23 — Public API and API keys

### SD-114 / Task 23.1 — OpenAPI document generated from the Zod schemas, `/api/v1`

**Priority:** P0 · **Size:** L · **Labels:** [STANDARD], backend, docs · **Depends on:** SD-106

**Objective:** One source of truth for the contract: the same Zod schemas that validate requests produce the published OpenAPI 3.1 document, and a test proves no route is undocumented.

**Implementation checklist**

- Extend the route registry that `defineRoute` already records (path, method, auth option, permission, request and response schemas) so each route can declare an `openapi` block (summary, tag, response schemas, error codes).
- Generator script `npm run openapi:generate` writing `apps/backend/openapi/openapi.json`; served by `GET /api/v1/openapi.json`; committed so reviewers see contract diffs.
- `/api/v1/tickets` and `/api/v1/tickets/{id}` alias the existing handlers; the SPA keeps using `/api/...`.
- Contract tests: every registered route is documented or explicitly listed as internal; response bodies of the happy paths validate against the declared schemas; `openapi-diff` in CI flags breaking changes.
- Security schemes: `cookieSession` + `csrfHeader` for browser routes, `bearerApiKey` for v1.

**Acceptance criteria**

- [ ] The document validates against the OpenAPI 3.1 schema (spectral lint in CI).
- [ ] Adding a route without declaring it public or internal fails the contract test (SEC-106).
- [ ] A removed response field fails `openapi-diff` as breaking.
- [ ] Minimum 80% test coverage for this module.

### SD-115 / Task 23.2 — API key model, issuance and revocation

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, database, security · **Depends on:** SD-114, SD-107

**Objective:** Let a user create long-lived, scoped, revocable credentials for scripts, stored so that a database leak does not reveal them.

**Implementation checklist**

- Migration for `api_keys` (section 3); permissions `api-keys:manage-own` in `codes.ts`, `matrix.ts`, `docs/permissions.md`.
- Key format `sdk_<8-char prefix>_<43-char base64url of 32 random bytes>`; digest is `SHA-256(API_KEY_PEPPER || secret)` stored hex; the prefix identifies the row, constant-time digest comparison.
- Scopes limited to ticket scopes (`tickets:create`, `tickets:read`, `tickets:status:update`, `tickets:assign`), each mapping to existing permission codes; the creation endpoint refuses any scope the caller does not hold now.
- Expiry required (maximum 365 days, default 90); maximum 10 active keys per user; name sanitised with `sanitizeForLog`.
- Audit events `API_KEY_CREATED`, `API_KEY_REVOKED`, `API_KEY_USED_DENIED` (catalogue and schema; details hold ids and scopes, never the secret or digest).
- Revoke when the owner is blocked, deleted or loses the role that granted the scopes (hook into the existing session-revocation transactions).

**Acceptance criteria**

- [ ] The database holds only the digest; the secret is returned once, in the creation response, and never again (SEC-107).
- [ ] A revoked, expired or owner-blocked key is refused with `401 API_KEY_INVALID` (SEC-107).
- [ ] A user cannot create a key with a scope the role does not grant (SEC-108).
- [ ] Administrator holds no `api-keys:*` permission (`matrix.test.ts`).
- [ ] Minimum 80% test coverage for this module.

### SD-116 / Task 23.3 — API key authentication stage and per-key limits

**Priority:** P0 · **Size:** L · **Labels:** [HARDENING], backend, security · **Depends on:** SD-115, SD-111

**Objective:** Authenticate machine clients without cookies or CSRF, while keeping every authorization and object-level rule of the browser path.

**Implementation checklist**

- New `defineRoute` authentication option `apiKey` (allowed only on `/api/v1` routes): reads `Authorization: Bearer`, resolves the key, builds the same `AuthContext` as a session with `authStage: 'full'` and `authMethod: 'api_key'`.
- Effective permissions are the **intersection** of the key's scopes and the owner's current permissions, evaluated at request time (SEC-108).
- Cookie and bearer credentials in one request return `400 MIXED_CREDENTIALS` (SEC-109); CSRF and Origin checks do not apply to key-authenticated requests, but CORS stays closed (no `Access-Control-Allow-Origin`), so browsers cannot use keys cross-site.
- Per-key rate limit (default 120 per minute, configurable in security settings) via the shared limiter; failures return `429` with `Retry-After`, identical for valid and invalid prefixes (SEC-110).
- Update `last_used_at` at most once per minute per key (write throttling).
- Audit: key-authenticated writes carry `actor` = owner and `details.auth = 'api_key'` plus the key prefix.

**Acceptance criteria**

- [ ] A key without `tickets:create` cannot create a ticket; a key whose owner was demoted loses the permission immediately (SEC-108).
- [ ] A request with both a session cookie and a bearer key is rejected (SEC-109).
- [ ] The 121st request in a minute returns `429`; an invalid-prefix flood returns the same envelope (SEC-110).
- [ ] The object-level rule still holds: a key of a Guest reads only that Guest's tickets (`404` otherwise).
- [ ] Minimum 80% test coverage for this module.

### SD-117 / Task 23.4 — Outbound signed webhooks

**Priority:** P1 · **Size:** XL · **Labels:** [STANDARD], backend, security · **Depends on:** SD-114, SD-113

**Objective:** Notify external systems of ticket events with authenticated, replay-resistant, SSRF-safe deliveries.

**Implementation checklist**

- Domain events `ticket.created`, `ticket.assigned`, `ticket.status_changed` emitted from `tickets/service.ts` after commit through a small in-process emitter (`server/events/domain-events.ts`), later superseded by the transactional outbox (SD-180).
- A subscriber receives only events of tickets its **owner may read** (the `tickets/policy.ts` predicate is applied at emit time), and the payload contains identifiers, status and timestamps only, never title or description.
- Signature: `X-SecureDesk-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, t + "." + body)>` plus `X-SecureDesk-Event-Id` for idempotency; a documented 5-minute tolerance for receivers; a reference verifier snippet in `docs/webhooks.md` and a tested Node implementation in `examples/`.
- Delivery worker: durable `webhook_deliveries` rows, attempts at 10 s, 1 min, 5 min, 30 min, 2 h with jitter, then `DEAD`; the subscription is disabled after 20 consecutive failures; 5 s connect and 10 s total timeout; redirects not followed; response body discarded.
- SSRF guard shared (`server/security/ssrf-guard.ts`): HTTPS only (HTTP only for `WEBHOOK_ALLOW_LOOPBACK` in tests), resolve DNS and refuse loopback, private, link-local (169.254.0.0/16 including cloud metadata), unique-local IPv6 and multicast; **re-check at delivery time** and connect to the resolved IP (defeats DNS rebinding); refuse userinfo in URLs and non-standard ports unless allowlisted.
- Secrets generated server-side (shown once), stored encrypted; rotation endpoint with a 24-hour overlap where both signatures are sent.

**Acceptance criteria**

- [ ] The reference verifier accepts a delivery and rejects a tampered body, a wrong secret and a timestamp older than five minutes (SEC-111).
- [ ] Subscribing to `http://169.254.169.254/`, `https://localhost/`, an internal hostname, or a hostname that resolves to a private address is refused with `422 WEBHOOK_TARGET_REFUSED`; a host that changes its DNS answer after subscription is refused at delivery (SEC-112).
- [ ] A failing receiver yields the documented retry schedule on the fake clock, then `DEAD`; the ticket request that caused the event is never delayed (SEC-113).
- [ ] A user never receives an event for a ticket they cannot read (leak test across roles).
- [ ] Minimum 80% test coverage for this module.

### SD-118 / Task 23.5 — Key and webhook management UI, generated client and integration docs

**Priority:** P1 · **Size:** M · **Labels:** [PORTFOLIO], frontend, docs · **Depends on:** SD-116, SD-117

**Objective:** Make the integration surface usable and demonstrable without `curl`.

**Implementation checklist**

- Angular pages `/account/api-keys` and `/account/webhooks` (standalone components, route guards by permission, one-time secret display held in memory and cleared on navigation, copy button, delivery log table).
- Generate a TypeScript client from `openapi.json` into `packages/api-client/` (workspace package, `openapi-typescript` plus a 40-line fetch wrapper); the Angular app is **not** switched to it in this module (record as D4-07), but a Node example script uses it.
- `docs/api.md`: authentication, scopes, errors, rate limits, pagination, webhook verification, a complete `curl` walkthrough, and a Postman collection export.
- Component and E2E tests: create a key, copy it, call `/api/v1/tickets` with it, revoke, see `401`.

**Acceptance criteria**

- [ ] The key secret never appears in the DOM after the creation dialog closes, in the URL, in storage or in console output.
- [ ] The documented `curl` walkthrough works verbatim against the compose stack.
- [ ] The generated client compiles in CI and its example script creates and reads a ticket.
- [ ] Minimum 80% test coverage for this module.

---

## EPIC 24 — Production hardening

### SD-119 / Task 24.1 — Reverse proxy reference deployment and SPA security headers

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], [STANDARD], devops, security · **Depends on:** SD-101

**Objective:** The API already sends CSP, `nosniff`, framing and referrer headers; the SPA that users actually load sends none. Ship a reference proxy configuration with a strict policy.

**Implementation checklist**

- `deploy/Caddyfile`: automatic TLS (local CA in dev), HTTP to HTTPS redirect, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera, microphone, geolocation, `Cross-Origin-Opener-Policy: same-origin`, and a CSP such as `default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`.
- Make the Angular build CSP-compatible: no inline scripts, `ngCspNonce` or hashed styles, fonts self-hosted (already via `@fontsource`); remove any inline style that needs `'unsafe-inline'`, and verify the Turnstile widget and the local CAPTCHA image work.
- The proxy **overwrites** `X-Forwarded-For` with the address it saw (matches the existing `TRUSTED_PROXY_HOPS=1` contract); document and test it.
- Long-cache immutable hashed assets, `no-store` for `index.html`.
- Test script `scripts/check-headers.ts` that fetches the SPA through the proxy and asserts every header, the absence of `unsafe-inline` and `unsafe-eval` in `script-src`, and that a spoofed incoming `X-Forwarded-For` has no effect (SEC-114).

**Acceptance criteria**

- [ ] The SPA responds with the full header set above on every route; an online grader (securityheaders.com style check, run locally via the script) reports at least A.
- [ ] Browser console shows no CSP violation during the login, ticket and admin journeys (E2E assertion on `securitypolicyviolation`).
- [ ] A client-supplied `X-Forwarded-For` cannot change the recorded address (SEC-56 still holds through the proxy).
- [ ] Minimum 80% test coverage for this module.

### SD-120 / Task 24.2 — Audit ticket lifecycle events

**Priority:** P0 · **Size:** M · **Labels:** [HARDENING], backend, security · **Depends on:** SD-107

**Objective:** The README states that ticket creation, assignment and status changes are not audit events. For a helpdesk that is the most obvious gap; close it without putting ticket text into the log.

**Implementation checklist**

- Catalogue entries in `audit/events.ts`: `TICKET_CREATED`, `TICKET_ASSIGNED`, `TICKET_STATUS_CHANGED` (outcomes, strict details: `ticketId`, `from`, `to`, `assigneeId`), `TICKET_ACCESS_DENIED` stays as `OBJECT_ACCESS_DENIED`.
- Call them from `tickets/service.ts` inside the same transaction as the change (fail-closed, like other state changes).
- Update `audit-coverage.test.ts` and the route coverage guard so a new ticket mutation without an entry fails.
- Update README ("Ticket creation … are not audit events"), `docs/audit-log.md`, the threat model and the demo notes.

**Acceptance criteria**

- [ ] Creating, assigning and changing the status of a ticket each write exactly one entry with actor, ticket id and old and new values; the title and description are not in the entry (SEC-115).
- [ ] If the audit write fails, the ticket change rolls back (SEC-73 pattern).
- [ ] The coverage guard fails when a ticket mutation route does not record an entry.
- [ ] Minimum 80% test coverage for this module.

### SD-121 / Task 24.3 — OpenTelemetry traces and Prometheus metrics

**Priority:** P1 · **Size:** L · **Labels:** [STANDARD], backend, devops · **Depends on:** SD-106

**Objective:** Make the system observable the way a production service would be: request traces, security-relevant metrics, and a provisioned dashboard.

**Implementation checklist**

- `instrumentation.ts`: `@opentelemetry/sdk-node` with the HTTP and `pg` instrumentations, W3C trace context propagated to outbound webhook and Turnstile calls, OTLP exporter only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; **no request bodies, cookies, `Authorization`, logins or IPs as span attributes** (attribute allowlist).
- `GET /api/metrics` (Prometheus text) protected by `Bearer METRICS_TOKEN` and bound to the internal compose network; metrics: request duration histogram by route template and status class, `login_outcomes_total{outcome}`, `audit_append_seconds`, `audit_verify_status`, `rate_limit_refusals_total{purpose}`, `redis_up`, `postgres_pool_in_use`, `webhook_deliveries_total{status}`, `security_events_total{type,severity}`.
- Label cardinality guard: only declared label values; a test fails when a label would contain a user-controlled string.
- Add Prometheus and an OTel collector to the `observability` compose profile; provision a Grafana dashboard JSON (security overview: logins, lockouts, alerts, latency) beside the existing Loki dashboard; screenshot in `docs/`.

**Acceptance criteria**

- [ ] `/api/metrics` returns `401` without the token and is not reachable from the public proxy route (SEC-116).
- [ ] Spans for a login contain the route template and status but none of login, IP, cookie or password (test over exported spans).
- [ ] The Grafana dashboard loads from provisioning and shows data after the bot-sim run.
- [ ] Minimum 80% test coverage for this module.

### SD-122 / Task 24.4 — OWASP ASVS mapping and gap analysis

**Priority:** P1 · **Size:** M · **Labels:** [STANDARD], [PORTFOLIO], docs, security · **Depends on:** SD-93

**Objective:** Translate the existing controls and SEC tests into the vocabulary hiring managers and auditors use, and be honest about gaps.

**Implementation checklist**

- `docs/asvs.md`: for ASVS 5.0 level 1 (all chapters) and level 2 (V2 authentication, V3 session, V4 access control, V7 logging, V13 API): requirement ID, status (`MET`, `PARTIAL`, `NOT APPLICABLE`, `GAP`), control, code path, test ID. Machine-readable twin `docs/asvs.json`.
- Script `scripts/check-asvs.ts` (added to `npm test`): every referenced `SEC-nn` exists in `docs/testing.md`; every requirement has a status; `GAP` entries link to a backlog item.
- Summary table with percentages per chapter in the README.

**Acceptance criteria**

- [ ] All level 1 requirements are classified; no `GAP` without a linked backlog issue or accepted-risk note.
- [ ] The check script fails when a referenced test ID is removed (SEC-117).
- [ ] The README shows the summary and links the full table.
- [ ] Minimum 80% test coverage for this module (the check script is unit tested).

### SD-123 / Task 24.5 — Module 4 verification, documentation and release

**Priority:** P0 · **Size:** M · **Labels:** [FOUNDATION], docs, testing · **Depends on:** all P0 tasks of Module 4

**Objective:** Close the module: everything green, documented and released.

**Implementation checklist**

- Add SEC-97 to SEC-118 to `docs/testing.md`; extend the threat model with section 8's table; update `docs/architecture.md`, `docs/permissions.md`, `docs/database-schema.md`, README.
- E2E journey: clean clone, `docker compose up`, sign in as the four roles, create an API key, call `/api/v1/tickets`, receive a signed webhook on a local receiver, and verify the audit chain on Postgres.
- Run the verification sequence (section 12) three times; tag `v1.0.0` and let the release pipeline produce signed artifacts.
- Update the Polish report generator source or add `docs/course/report-module-4.md` (optional, not course-required).

**Acceptance criteria**

- [ ] All checks green on `main`: CI, CodeQL, gitleaks, Trivy, E2E (three consecutive runs), ZAP baseline.
- [ ] `v1.0.0` release exists with signed images, SBOM and provenance.
- [ ] A reviewer can run the whole system from the README in under 10 minutes.
- [ ] Minimum 80% test coverage for this module.

---

## 7. Security acceptance test matrix

IDs continue the sequence (SEC-96 was the last of Module 3) so `docs/testing.md` and `scripts/check-sec-traceability.ts` work unchanged.

| ID      | Scenario                                                                              | Expected outcome                                                                         | Evidence             |
| ------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------- |
| SEC-97  | `UPDATE`, `DELETE`, `TRUNCATE` on `audit_log` as the migrator role                    | Aborted by triggers with the append-only message                                         | DB test              |
| SEC-98  | The same statements and any DDL as the application role                               | Refused for lack of privilege                                                            | DB test              |
| SEC-99  | Block, delete, role change of `ADMIN` directly in SQL                                 | Refused by triggers                                                                      | DB test              |
| SEC-100 | 50 concurrent audit appends from two pooled connections                               | Gapless `seq`, valid chain                                                               | Concurrency test     |
| SEC-101 | 50 parallel wrong-password logins across two processes                                | At most five credential checks                                                           | Integration test     |
| SEC-102 | Sixth failure, alternating processes, known and unknown login                         | Throttled identically                                                                    | Integration test     |
| SEC-103 | Redis stopped, then a login                                                           | `503`, no credential check; health shows Redis down                                      | Fault-injection test |
| SEC-104 | Breaker opened by instance A; request to B; replayed token to B; TOTP code to both    | B honours the breaker; replay refused; code accepted once                                | Integration test     |
| SEC-105 | Import the demo SQLite database; import a tampered one                                | Counts equal and `INTACT`; tampered import fails naming `seq`, nothing committed         | Integration test     |
| SEC-106 | Add a route without declaring it; remove a response field                             | Contract test fails; `openapi-diff` reports breaking                                     | CI test              |
| SEC-107 | Create, use, revoke, expire, block owner                                              | Digest only in DB; secret once; revoked, expired, blocked owner give `401`               | Integration test     |
| SEC-108 | Key without a scope; owner demoted; scope above role at creation                      | `403`/`401`; permissions are the intersection at use time                                | Integration test     |
| SEC-109 | Cookie and bearer in one request                                                      | `400 MIXED_CREDENTIALS`                                                                  | API test             |
| SEC-110 | 121 requests per minute; invalid-prefix flood                                         | `429` with `Retry-After`; identical envelope                                             | Fake-clock test      |
| SEC-111 | Reference verifier: valid, tampered body, wrong secret, 10-minute-old timestamp       | Accept; reject; reject; reject                                                           | Unit test            |
| SEC-112 | Webhook target: metadata IP, loopback, private host, DNS rebinding after subscription | Refused at subscription and at delivery                                                  | Integration test     |
| SEC-113 | Receiver down                                                                         | Documented backoff, `DEAD`, request not delayed, subscription disabled after 20 failures | Fake-clock test      |
| SEC-114 | SPA fetched through the proxy; spoofed `X-Forwarded-For`                              | Full header set, no `unsafe-inline` in `script-src`; spoof ignored                       | Script + E2E         |
| SEC-115 | Create, assign, change status of a ticket                                             | One entry each, ids and values only, no ticket text; rollback on audit failure           | Integration test     |
| SEC-116 | `/api/metrics` without token, through the public route; span attributes               | `401` or unreachable; no login, IP, cookie in spans or labels                            | Integration test     |
| SEC-117 | Remove a test referenced by `docs/asvs.json`                                          | Check script fails                                                                       | Unit test            |
| SEC-118 | Start the compose stack                                                               | Non-root, read-only root FS, no capabilities, no secret in image history                 | CI smoke script      |

---

## 8. Threat model additions

| Threat                         | Risk                                                      | Planned control                                                                   | Test             |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------- |
| Compromised application role   | Attacker with SQL access erases audit history             | Privileges plus triggers; app role cannot modify `audit_log` or run DDL           | SEC-98           |
| Limiter bypass by instance hop | Attacker spreads guesses across processes                 | Shared atomic limiter in Redis                                                    | SEC-101          |
| Redis outage abused            | Attacker takes Redis down to remove limits                | Security limiters fail closed                                                     | SEC-103          |
| Stolen API key                 | Long-lived credential leaks from a script                 | Scoped to tickets, expiry, revocation, digest-only storage, per-key limits, audit | SEC-107          |
| Confused deputy through keys   | Key outlives the owner's privileges                       | Effective permission is the intersection evaluated at use time                    | SEC-108          |
| Cross-site use of a key        | Browser sends a key automatically                         | Bearer only, no cookies, no CORS                                                  | SEC-109          |
| SSRF through webhooks          | Attacker aims deliveries at internal services or metadata | HTTPS-only, address-class refusal, resolve-and-pin at delivery, no redirects      | SEC-112          |
| Webhook forgery or replay      | Receiver trusts a forged event                            | HMAC with timestamp and event ID                                                  | SEC-111          |
| Webhook data leakage           | Event reveals tickets the subscriber cannot read          | Policy applied at emit time, identifiers-only payloads                            | SD-117 leak test |
| Missing browser protections    | XSS or clickjacking against the SPA                       | CSP without `unsafe-inline`, framing and referrer controls, HSTS                  | SEC-114          |
| Supply-chain compromise        | Malicious dependency or tampered image                    | Audit gate, OSV, Dependabot, SBOM, signed images, provenance, pinned actions      | CI               |
| Secrets in the repository      | A key is committed                                        | gitleaks on history and diffs, push protection, `.gitignore` rules                | CI               |
| Metrics as a data source       | Telemetry leaks personal data                             | Attribute allowlist, label guard, authenticated internal endpoint                 | SEC-116          |
| Unaudited ticket changes       | A ticket is reassigned without a trace                    | Lifecycle events fail closed                                                      | SEC-115          |

Residual risks to state: a single Postgres and Redis instance is a single point of failure; keys and webhooks add a larger public surface; ZAP baseline is not a penetration test; ASVS self-assessment is not a certification.

---

## 9. Recommended implementation order and dependencies

- **Phase A (days 1–3):** SD-93, SD-94, SD-95, SD-96, SD-97. Outcome: a clean public repository with CI.
- **Phase B:** SD-98, SD-99, SD-100. Outcome: static analysis, secret scanning and dependency checks on every pull request.
- **Phase C (the critical path):** SD-104, SD-105, SD-106, SD-107, SD-108, then SD-109. Outcome: Postgres everywhere. Modules 5 to 7 start only after SD-108.
- **Phase D:** SD-110, SD-111, SD-112, SD-113. Outcome: shared state.
- **Phase E:** SD-101, SD-102, SD-103, SD-119. Outcome: containers, DAST, signed release, proxy headers.
- **Phase F:** SD-114, SD-115, SD-116, SD-117, SD-118. Outcome: integration surface.
- **Phase G:** SD-120, SD-121, SD-122, SD-123.

```text
SD-93 ─▶ SD-94, SD-95, SD-96, SD-97 ─▶ SD-98, SD-99, SD-100
SD-96, SD-97 ─▶ SD-104 ─▶ SD-105 ─▶ SD-106 ─▶ SD-107 ─▶ SD-108 ─▶ SD-109
SD-104 ─▶ SD-110 ─▶ SD-111 ─▶ SD-112          SD-110 ─▶ SD-113
SD-104, SD-97 ─▶ SD-101 ─▶ SD-102, SD-103, SD-119
SD-106 ─▶ SD-114 ─▶ SD-115 ─▶ SD-116 ─▶ SD-117 ─▶ SD-118
SD-107 ─▶ SD-120          SD-106 ─▶ SD-121          SD-93 ─▶ SD-122
all P0 ─▶ SD-123
```

---

## 10. Definition of Done

A backlog item is done only when: it meets its acceptance criteria; the backend enforces the rule independently of Angular; input is validated server-side with strict schemas; nothing secret or user-controlled is written to a log, span, metric label or Redis key unsanitised; positive and negative automated tests exist and pass; new routes and permission codes are documented in the permission doc and the OpenAPI document; schema changes have migrations that keep existing data; failures are consistent and leak no internals; the feature runs from a clean clone through `docker compose up`; and CI is green.

### 10.1 Definition of Done for the entire Module 4

- The repository history, licence, security policy, templates and README present a maintained project.
- CI (lint, typecheck, format, unit, integration, E2E), CodeQL, gitleaks, dependency, image and DAST checks run on every pull request or on schedule, and `main` is protected by them.
- PostgreSQL and Redis replace SQLite and the in-memory limiter; audit immutability, ADMIN protection and chain concurrency are proven on Postgres; the data-migration tool preserves the chain.
- OpenAPI contract, API keys and signed webhooks work, are documented and covered by SEC-106 to SEC-113.
- The SPA is served with a strict CSP and HSTS; ticket lifecycle events are audited; metrics and traces exist without personal data; ASVS mapping is published.
- A signed `v1.0.0` release with SBOM and provenance exists.
- All tests are green with the 80% coverage gate and SEC-01 to SEC-118 traceability.

---

## 11. Decisions, assumptions and open points

| ID    | Topic                         | Decision                                                                                                             | Status                                           |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D4-01 | Database                      | PostgreSQL only; SQLite dropped; tests use Testcontainers                                                            | [DESIGN], confirmed by the project owner         |
| D4-02 | Local infrastructure          | Postgres, Redis, Keycloak, Mailpit, ClamAV, Loki, Grafana all run in `docker compose`, mostly behind profiles        | [DESIGN], confirmed                              |
| D4-03 | Audit format                  | `sd-audit-v1` canonical form is unchanged by the migration so existing chains keep verifying                         | [DESIGN]                                         |
| D4-04 | Redis outage policy           | Security limiters fail closed; non-security caches fail open and log                                                 | [HARDENING]                                      |
| D4-05 | Who gets keys and webhooks    | Manager, Employee, Guest only; never the Administrator (no ticket access by design); ticket scopes only              | [HARDENING]                                      |
| D4-06 | API versioning                | `/api/v1/tickets` alias is the stable contract; `/api/...` stays internal to the SPA                                 | [DESIGN]                                         |
| D4-07 | Frontend and generated client | The Angular app keeps its hand-written services in this module; the generated client serves integrators and examples | [DESIGN]                                         |
| D4-08 | Licence                       | MIT                                                                                                                  | [FOUNDATION]; change only on the owner's request |
| D4-09 | Language                      | UI English, API messages Polish, new docs English                                                                    | Consistency with existing code                   |

### 11.1 Open points

- **O4-01** Whether `AGENTS.md` and `CLAUDE.md` should be public (SD-93).
- **O4-02** Whether to publish Docker images to GHCR under the owner's account or only build in CI (SD-103). Signing requires the public GitHub OIDC identity.
- **O4-03** Advisory-lock versus `audit_head` row lock for the audit append: benchmark in SD-107 and record in an ADR.
- **O4-04** Hosting a read-only public demo is deliberately out of scope; revisit after SD-123.

---

## 12. Recommended final verification sequence

1. Clean clone; `docker compose up --build`; wait for health.
2. Sign in as `ADMIN`, `manager1`, `employee1`, `guest1`; create, assign and resolve a ticket; confirm the three ticket audit entries and **Verify integrity** shows `INTACT` on Postgres.
3. As `guest1` create an API key with `tickets:read` and `tickets:create`; call `/api/v1/tickets` with it; confirm the cookie-plus-bearer rejection and the `429` at the limit.
4. Subscribe a local receiver to ticket events; verify the signature with the reference verifier; stop the receiver and observe retries; try subscribing to `http://169.254.169.254/`.
5. Stop Redis and attempt a login (`503`); restart and confirm limits still hold after a backend restart.
6. Fetch the SPA through Caddy and run `scripts/check-headers.ts`; confirm no CSP violation in the browser journeys.
7. Run `npm run audit:tamper-demo` against Postgres; run `npm run db:import:sqlite` on the legacy demo file.
8. Open the Grafana security dashboard after `npm run bot-sim`.
9. Run `npm test`, `npm run test:e2e` three times, ZAP baseline, Trivy; tag the release and verify the signature with `cosign verify`.

---

## 13. References

- OWASP ASVS 5.0; OWASP API Security Top 10 (2023); OWASP Cheat Sheets: REST Security, Server-Side Request Forgery Prevention, Secrets Management.
- SLSA specification; Sigstore cosign documentation; CycloneDX specification.
- PostgreSQL documentation: privileges, triggers, advisory locks, `timestamptz`.
- Redis documentation: Lua scripting, pub/sub; Testcontainers for Node.
- OpenAPI 3.1; OpenTelemetry semantic conventions; Prometheus exposition format.
- Caddy documentation: `header`, `tls`, `reverse_proxy`.
