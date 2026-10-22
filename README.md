# SecureDesk

**SecureDesk** is a security-focused web application developed as an academic project for a **Cybersecurity** course.

The project is planned as a simple internal helpdesk system, with an emphasis on building secure authentication, authorization, and user management from the start. It will be developed incrementally as new course requirements are introduced.

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

## Current Status

🚧 **Early development** — the monorepo skeleton (SD-01) is in place: both apps build, lint, type-check and run together, and the Angular app reaches the backend through the same-origin `/api` proxy. Authentication, RBAC, the database and the admin UI are added in later tasks.

## Prerequisites

- **Node.js 24 (current LTS)**, version pinned in `.nvmrc` (`nvm use` picks it up). Angular 22 also supports Node 26, but the repo targets 24 (`engines`), so newer Node prints an `EBADENGINE` warning that can be ignored.
- **npm** (ships with Node 24).
- `openssl` (only to generate the CSRF secret).

## Install

```bash
npm ci
cp .env.example .env
```

`.env` is git-ignored. Only `.env.example` (placeholders, no secrets) is tracked. Replace `CSRF_SECRET` with a real value before using anything other than the skeleton:

```bash
openssl rand -base64 32
```

> The skeleton does not read `.env` yet. Variables start being consumed by the backend in the authentication and database tasks.

## Run

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
```

Coverage uses V8 and **fails the run below 80%** for lines, statements, functions and branches (`vitest.config.ts`).

## Database (placeholders)

```bash
npm run db:migrate
npm run db:seed
```

These currently only print a notice. They delegate to the backend workspace and gain real behaviour in Tasks 1.2 (schema/migrations) and 1.4 (seeds).

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

## Purpose

SecureDesk is a learning project intended to demonstrate practical cybersecurity concepts in a real web application. It is **not currently intended for production use**.
