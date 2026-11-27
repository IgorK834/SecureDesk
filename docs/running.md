# Running SecureDesk

Everything needed to run, build and test the project on one machine. The README has the short
version; this is the full one.

## Prerequisites

- **Node.js 24**, pinned in `.nvmrc` (`nvm use` picks it up). Newer Node versions print an
  `EBADENGINE` warning that can be ignored.
- **npm** (ships with Node).
- `openssl`, to generate secrets, and a POSIX shell (macOS, Linux, WSL).
- Internet access for the **first-login password change**: it renders the Cloudflare Turnstile widget
  (the Cloudflare _test_ keys from `.env.example` work locally). Everything else runs offline.
- Optional: `npx playwright install chromium` once, for the browser tests.

## 1. Install and configure

```bash
npm ci
cp .env.example .env
```

`.env` is git-ignored; only `.env.example` (placeholders) is tracked. Replace the four placeholder
secrets with independent random values, and disable the end-to-end database variable:

```bash
for key in CSRF_SECRET TOTP_ENCRYPTION_KEY CAPTCHA_HMAC_SECRET AUDIT_SUBJECT_PEPPER; do
  sed -i.bak "s|^$key=.*|$key=$(openssl rand -base64 32)|" .env
done
sed -i.bak 's|^E2E_DATABASE_PATH=|# E2E_DATABASE_PATH=|' .env && rm -f .env.bak
```

> **Why the last line:** when `E2E_DATABASE_PATH` is set it takes precedence over `DATABASE_PATH`, so
> without commenting it out the app, migrations and seed would all use the Playwright test database
> (`securedesk.e2e.sqlite`), which `npx playwright test` resets. With it commented out they use
> `apps/backend/data/securedesk.dev.sqlite`.

The backend reads this single root `.env` (Next.js through `next.config.ts`, the `db:*` scripts through
`--env-file-if-exists`). Relative paths such as `DATABASE_PATH` resolve from `apps/backend`.

## 2. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

The seed creates the roles and permissions, the settings row, `ADMIN`, six demonstration accounts
(`manager1`, `manager2`, `employee1`, `employee2`, `guest1`, `guest2`) and five demo tickets. A final
`audit.verification.schedule_failed` log line after seeding is harmless.

## 3. Get the initial login

The seed generates a random one-time password per account and writes them to
`apps/backend/.local/initial-credentials.txt` (git-ignored, owner-only). The terminal never prints a
password. Open the file locally; each line is `login: password`. The `ADMIN` password does not expire
until changed, the six test users' passwords are valid for 12 hours.

Every seeded account must **replace its temporary password at first login** (the app redirects you;
minimum length 12). Delete the credentials file once you have signed in with every account you need.
To start over: `npm run db:reset:dev && npm run db:migrate && npm run db:seed`.

## 4. Start both apps

```bash
npm run dev
```

| Service          | URL                              |
| ---------------- | -------------------------------- |
| Angular SPA      | http://localhost:4200            |
| Next.js API      | http://localhost:3000            |
| Health via proxy | http://localhost:4200/api/health |

The browser only talks to `:4200`; the Angular dev server forwards `/api/*` to `:3000`
(`apps/frontend/proxy.conf.json`), so there is one origin and no CORS configuration. Check with
`curl -i http://localhost:4200/api/health` (`200`, `{"status":"ok"}`). Sign in at
http://localhost:4200/login: reverse the characters of the CAPTCHA image and enter them.

## Local demonstration versus external integrations

| Works fully offline with the defaults                                                                                                                            | Needs external configuration                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login with the local CAPTCHA, lockout, sessions, RBAC, tickets, security events, audit log, verification, tamper demo, `bot-sim`, the whole automated test suite | First-login and ordinary password change (Turnstile widget needs internet; real keys for anything but local use), Canarytokens alerts (`CANARY_*`, `CANARYTOKENS_WEBHOOK_SECRET`), alert webhook (`ALERT_WEBHOOK_URL`), Loki shipping (`LOKI_PUSH_URL`, [`loki.md`](loki.md)), reCAPTCHA v3 |

Leave `CANARY_ALERTS_ENABLED=false` and the `CANARY_*`, `ALERT_WEBHOOK_URL`, `CANARYTOKENS_WEBHOOK_SECRET`
and `LOKI_PUSH_URL` values empty for a fully offline run. Automated tests deliberately never call
Cloudflare, Canarytokens or AWS. `CAPTCHA_TEST_MODE=true` and `TURNSTILE_VERIFY_URL` are test-only and
rejected in production.

The app reads `AUDIT_SUBJECT_PEPPER`, `AUDIT_EXPORT_MAX_ROWS`, `AUDIT_VERIFY_INTERVAL_MINUTES`,
`AUDIT_ANCHOR_PATH` and `ALERT_FILE_PATH` from the backend environment. The default verification
interval is 60 minutes and the export cap is 100,000 rows. The anchor and alert path overrides
must point outside served directories. `npm run audit:verify` verifies the selected database.
Optional integrations use `CANARYTOKENS_WEBHOOK_SECRET` and `LOKI_PUSH_URL`; their setup is in the
[Canarytokens guide](canarytokens.md) and the [Loki guide](loki.md).

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
npm run test:e2e:module3           # Module 3 journeys, zero retries, fresh temporary database
npm run check:image-locations      # repository images must live under docs/report-evidence/
```

Coverage uses V8 and **fails the run below 80%** for lines, statements, functions and branches (`vitest.config.ts`).
Playwright resets only `data/securedesk.e2e.sqlite`, migrates and seeds it, and stores generated
test credentials in the git-ignored `tests/e2e/.credentials.json`. The `@slow` inactivity case
takes about 65 seconds. Browser evidence is reproduced under `report-evidence/`; no development
database or committed credential is used.

The Module 2 release check is three consecutive `npm run test:e2e:module2` runs. It regenerates the
eight files in `report-evidence/module-2/`. The browser serves a local Turnstile widget script,
the backend calls a local verification stub, and login accepts the one-time `TEST-SOLVED` answer in
the isolated E2E process only.

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

`db:seed` generates a fresh random temporary password for each account it creates and writes them,
owner-readable only, to `apps/backend/.local/initial-credentials.txt` (git-ignored). The terminal
shows the file path, never the passwords. Every seeded account must change its password at first
login. See [Seeding](database-schema.md#seeding).

`db:migrate:test` and `db:seed:test` set `NODE_ENV` inline, so they need a POSIX shell (macOS,
Linux, WSL). The database files live in the git-ignored `apps/backend/data/` directory. Details
and rules: [database-schema.md](database-schema.md).

## Password hashing

Passwords are stored only as Argon2id hashes, through one module
(`apps/backend/src/server/auth/password-hasher.ts`). To measure what the configured parameters cost
on your machine:

```bash
npm run bench:argon2 -w apps/backend -- 30    # 30 runs per operation
```

Parameters, measured times and the reasoning: [architecture.md](architecture.md#password-hashing).

## Repository layout

```text
apps/frontend/   Angular SPA (standalone components, routing, SCSS)
apps/backend/    Next.js API-only app (no React UI)
docs/            architecture, schema, permissions, threat model, runbooks, report evidence
docs/course/     course backlogs and reports (Polish reports, English backlogs)
scripts/         CLI tools: bot simulator, report builder, CI-style checks, issue generators
tests/           cross-app unit, integration and Playwright tests
observability/   Loki and Grafana provisioning for the optional audit log shipping
```
