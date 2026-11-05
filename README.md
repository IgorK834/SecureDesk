# SecureDesk

**SecureDesk** is a security-focused web application developed as an academic project for a **Cybersecurity** course.

It is a deliberately small internal helpdesk demonstrator whose complete security path is usable:
authentication, forced and ordinary password changes, revocable cookie sessions, CSRF protection,
RBAC, user/security administration, ticket object authorization, optional TOTP two-factor
authentication, layered login-abuse protection, two CAPTCHA providers and honeytoken alerts.

## Tech Stack

- **Angular** — frontend SPA (`apps/frontend`)
- **Next.js (Node.js)** — backend REST API, API-only, no UI (`apps/backend`)
- **SQLite** — database
- **TypeScript** (strict) — application code
- **npm workspaces**, ESLint (flat config), Prettier, Vitest

## Project Goals

- Implement secure login and password management.
- Manage users and permissions with role-based access control (RBAC).
- Handle sessions securely, including logout and inactivity timeouts.
- Apply secure development practices and test common security risks.
- Leave room for future features such as helpdesk tickets, security logging, and multi-factor authentication.

## Current status

Modules 1 and 2, their automated tests and their hermetic browser/API evidence are complete. The
two hosted Canarytokens notification screenshots require the manual live procedure in
[`docs/canarytokens.md`](docs/canarytokens.md); automated runs deliberately never call Cloudflare,
Canarytokens or AWS. The single-process SQLite deployment and process-local CAPTCHA circuit breaker
are documented limitations; this is a course project, not a production helpdesk service.

## Prerequisites

- **Node.js 24 (current LTS)**, version pinned in `.nvmrc` (`nvm use` picks it up). Angular 22 also supports Node 26, but the repo targets 24 (`engines`), so newer Node prints an `EBADENGINE` warning that can be ignored.
- **npm** (ships with Node 24).
- `openssl` (to generate independent CSRF and TOTP-encryption keys).

## Install

```bash
npm ci
cp .env.example .env
```

`.env` is git-ignored. Only `.env.example` (placeholders, no secrets) is tracked. Generate two
independent 32-byte values and put them in `CSRF_SECRET` and `TOTP_ENCRYPTION_KEY`:

```bash
openssl rand -base64 32
openssl rand -base64 32
```

Generate a third independent value for `CAPTCHA_HMAC_SECRET`. Login defaults to the local reversed-
string provider. Password change defaults to Cloudflare Turnstile and needs
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `CAPTCHA_EXPECTED_HOSTNAME`. Published Cloudflare
test keys may be used locally, but production startup rejects them. `CAPTCHA_TEST_MODE=true` and
`TURNSTILE_VERIFY_URL` are test-only and are also rejected in production.

Canarytokens configuration is optional for local development. Keep `CANARY_ALERTS_ENABLED=false`
and the `CANARY_*` values empty for an entirely offline run. Provisioning the Web-bug and AWS-key
tokens, triggering them and redacting the resulting evidence is documented in
[`docs/canarytokens.md`](docs/canarytokens.md); real values belong only in the untracked `.env`.

> The backend reads this single root `.env` (Next.js via `next.config.ts`, the `db:*` scripts via `--env-file-if-exists`). Relative paths such as `DATABASE_PATH` are resolved from `apps/backend`.

## Prepare the database and run

```bash
npm run db:migrate
npm run db:seed
```

The seed creates `ADMIN` plus six non-administrator demonstration accounts. It writes generated
one-time passwords to `apps/backend/.local/initial-credentials.txt` with owner-only permissions;
that file is git-ignored and the terminal never prints a password. Open it locally, sign in, and
replace each temporary password. Delete the file after delivery.

```bash
npm run dev
```

| Service          | URL                              |
| ---------------- | -------------------------------- |
| Angular SPA      | http://localhost:4200            |
| Next.js API      | http://localhost:3000            |
| Health via proxy | http://localhost:4200/api/health |

The browser only ever talks to `:4200`. The Angular dev server forwards `/api/*` to `:3000` (`apps/frontend/proxy.conf.json`), so there is a single origin and **no CORS** configuration. This is what allows strict same-origin cookie settings later on.

Quick check: `curl -i http://localhost:4200/api/health` returns `200` with `{"status":"ok"}`.

## Build

```bash
npm run build                      # both apps
npm run build -w apps/frontend     # Angular only
npm run build -w apps/backend      # Next.js only
```

## Lint, type-check, format

```bash
npm run lint
npm run typecheck
npm run format:check      # or: npm run format
```

## Test

```bash
npm test                  # vitest run --coverage
npx playwright install chromium   # once per machine
npx playwright test               # real browser, isolated E2E database, includes @slow
npm run test:e2e:module2           # seven Module 2 journeys, zero retries
```

Coverage uses V8 and **fails the run below 80%** for lines, statements, functions and branches (`vitest.config.ts`).
Playwright resets only `data/securedesk.e2e.sqlite`, migrates and seeds it, and stores generated
test credentials in the git-ignored `tests/e2e/.credentials.json`. The `@slow` inactivity case
takes about 65 seconds. Browser evidence is reproduced under `docs/report-evidence/`; no development
database or committed credential is used.

The Module 2 release check is three consecutive `npm run test:e2e:module2` runs. It regenerates the
eight files in `docs/report-evidence/module-2/`. The browser serves a local Turnstile widget script,
the backend calls a local verification stub, and login accepts the one-time `TEST-SOLVED` answer in
the isolated E2E process only.

## Reproduce the Module 2 demonstration

1. Copy `.env.example`, generate the three independent secrets above, migrate, seed and run the two
   applications. Leave the Canarytokens values empty for the offline demonstration.
2. On `/login`, omit or mistype the reversed-string proof to see the CAPTCHA refusal. Solve a new
   challenge and submit a wrong password five times to see the 15-minute account-lock countdown.
   Sign in as the seeded administrator and use the user detail page to unlock the account.
3. Sign in as a normal user, open `/account/change-password` and complete the Turnstile-controlled
   form. The automated equivalent additionally sends a forged proof directly to the API and records
   the real `403 CAPTCHA_FAILED` response.
4. Run `npm run bot-sim -- --target http://127.0.0.1:3000 --origin http://localhost:4200 --database
apps/backend/data/securedesk.e2e.sqlite` against the isolated E2E application. The script refuses
   non-local hosts without both explicit ownership consents.
5. Follow [`docs/canarytokens.md`](docs/canarytokens.md) for the live account-trap and AWS-key
   notifications. The local trap login, decoy access, administrator event view and bot matrix are
   reproduced by `npm run test:e2e:module2` without any third-party dependency.

## Database

SQLite via Drizzle ORM. The schema is only ever changed through versioned migrations, never by hand.

```bash
npm run db:migrate        # apply pending migrations to the dev database (creates the file)
npm run db:migrate:test   # same for the test database
npm run db:generate       # create a new migration after editing the schema
npm run db:reset:dev      # delete the dev database file (and -wal/-shm), then re-run db:migrate
npm run db:reset:test     # same for the test database, then re-run db:migrate:test
npm run db:seed           # seed roles, permissions, settings, ADMIN and six test users (idempotent)
npm run db:seed:test      # same, against the test database (no passwords are written to disk)
```

`db:seed` generates a fresh random temporary password for each account it creates and writes them, owner-readable only, to `apps/backend/.local/initial-credentials.txt` (git-ignored). The terminal shows the file path, never the passwords. Every seeded account must change its password at first login. See [Seeding](docs/database-schema.md#seeding).

`db:migrate:test` and `db:seed:test` set `NODE_ENV` inline, so they need a POSIX shell (macOS, Linux, WSL). The database files live in the git-ignored `apps/backend/data/` directory. Details and rules: [docs/database-schema.md](docs/database-schema.md).

## Password hashing

Passwords are stored only as Argon2id hashes, through one module (`apps/backend/src/server/auth/password-hasher.ts`). To measure what the configured parameters cost on your machine:

```bash
npm run bench:argon2 -w apps/backend -- 30    # 30 runs per operation
```

Parameters, measured times and the reasoning: [docs/architecture.md](docs/architecture.md#password-hashing).

## Architecture

> Diagram derived from the SD-01 task description. Replace with the backlog's section 3.1 diagram if it differs.

```text
 Browser
    │  same origin, relative URLs only (/api/...)
    ▼
 Angular SPA  (apps/frontend, :4200)
    │  dev: proxy.conf.json  /api -> http://localhost:3000
    │  prod: reverse proxy keeps SPA and /api on one origin
    ▼
 Next.js API  (apps/backend, :3000)   Route Handlers only, Node.js runtime
    │  src/app/api/{health,auth,admin,tickets}
    ▼
 src/server/{auth,users,permissions,security,tickets}
    ▼
 SQLite  (src/server/db, path from DATABASE_PATH)
```

## Repository layout

```text
apps/frontend/   Angular SPA (standalone components, routing, SCSS)
apps/backend/    Next.js API-only app (no React UI)
docs/            architecture, database schema, permissions, threat model, report evidence
tests/           cross-app tests (added in later tasks)
```

## Further documentation

- [Architecture and security design](docs/architecture.md)
- [Database schema and ER diagram](docs/database-schema.md)
- [Permission matrix](docs/permissions.md)
- [Threat model](docs/threat-model.md)
- [Test traceability](docs/testing.md)
- [Report evidence](docs/report-evidence/README.md)

## Purpose

SecureDesk is a learning project intended to demonstrate practical cybersecurity concepts in a
real web application. It is **not intended for production use**.
