# Database Schema

SecureDesk stores its data in SQLite through [Drizzle ORM](https://orm.drizzle.team). This document describes the persistence **pipeline** (Task 1.2). The table definitions are documented here once they are delivered in Task 1.3.

## Where things live

| What                     | Where (under `apps/backend/`)                            |
| ------------------------ | -------------------------------------------------------- |
| Schema (source of truth) | `src/server/db/schema/index.ts` (re-exports table files) |
| Generated migrations     | `src/server/db/migrations/` (committed)                  |
| Path resolution + checks | `src/server/db/config.ts`                                |
| Connection factory       | `src/server/db/connection.ts`                            |
| App singleton (`db`)     | `src/server/db/client.ts`                                |
| Migration runner         | `src/server/db/migrate.ts`, CLI `scripts/migrate.ts`     |
| Reset                    | `src/server/db/reset.ts`, CLI `scripts/reset-db.ts`      |
| Constraint error mapping | `src/server/db/errors.ts`                                |
| Database files           | `data/` (git-ignored)                                    |

## Configuration

The file is chosen from the root `.env`:

| Variable             | Used when           | Default in `.env.example`       |
| -------------------- | ------------------- | ------------------------------- |
| `DATABASE_PATH`      | `NODE_ENV` ≠ `test` | `./data/securedesk.dev.sqlite`  |
| `TEST_DATABASE_PATH` | `NODE_ENV=test`     | `./data/securedesk.test.sqlite` |

Relative paths are resolved from `apps/backend`, which is the working directory of every npm script. Every entry point (`db:migrate`, `db:reset:*`, `db:generate`, the Next.js app) fails immediately with a readable message and a non-zero exit code when:

- the variable for the current mode is missing or blank;
- `DATABASE_PATH` and `TEST_DATABASE_PATH` resolve to the same file (tests would destroy development data);
- `:memory:` is used outside `NODE_ENV=test`;
- the path is inside any `public/` directory or inside `apps/frontend` (a web server could serve it).

## Connections

All connections are created by `openConnection()` in `connection.ts` with:

```text
journal_mode = WAL      concurrent readers while writing
foreign_keys = ON       enforced by the database itself (set explicitly on every connection)
busy_timeout = 5000     wait up to 5 s on a locked database instead of failing at once
```

`client.ts` exports the shared `db` and caches the connection on `globalThis`, so Next.js dev hot reloads reuse one connection instead of opening a new one per reload.

`db` is **lazy**: the database is opened on the first query, not when the module is imported. `next build` imports every route module, so an eager connection would make the build fail (and create a database file) in any checkout without `DATABASE_PATH`. The consequence is that a bad configuration is reported on the first query rather than at import time. Code that needs a connection to an explicit path (tests, scripts) should use `createDb()` / `openConnection()` from `connection.ts`.

## Migration workflow

Migrations are generated, committed and applied. They are never edited by hand.

1. Edit the schema under `src/server/db/schema/`.
2. `npm run db:generate` creates a new SQL file plus snapshot in `src/server/db/migrations/`. Review it and commit it with the schema change.
3. `npm run db:migrate` applies pending migrations to the dev database. Applied migrations are recorded in `__drizzle_migrations` and never replayed, so existing rows are kept. After applying, the runner executes `PRAGMA foreign_key_check` and fails if any row violates a foreign key.

Rules:

- **Append-only.** Never edit or delete a migration that has been committed; fix mistakes with a new migration.
- **No destructive migrations** (dropping tables/columns, deleting data). Prefer additive changes. Review any `DROP`, table-rebuild or `DELETE` statement the generator emits before committing it.
- The database file is never committed and never lives in a static directory.

## Resetting

```bash
npm run db:reset:dev      # removes the DATABASE_PATH file plus -wal and -shm
npm run db:reset:test     # removes the TEST_DATABASE_PATH file plus -wal and -shm
npm run db:migrate        # rebuilds the schema from scratch
```

The reset deletes only the resolved file and its two companions, prints each file it removed, and refuses to run when `NODE_ENV=production`. Resetting the test database never touches the development database (and vice versa).

To rebuild a machine from nothing: `npm ci`, `cp .env.example .env`, `npm run db:migrate`.

## Errors returned to clients

`mapDbError(error)` in `errors.ts` converts known constraint violations into typed errors with fixed messages:

| SQLite code                    | Typed error      | Message                              |
| ------------------------------ | ---------------- | ------------------------------------ |
| `SQLITE_CONSTRAINT_UNIQUE`     | `ConflictError`  | `Resource already exists`            |
| `SQLITE_CONSTRAINT_PRIMARYKEY` | `ConflictError`  | `Resource already exists`            |
| `SQLITE_CONSTRAINT_FOREIGNKEY` | `ReferenceError` | `Referenced resource does not exist` |

`PRIMARYKEY` is mapped too because composite-key join tables (for example a role/permission link added twice) report duplicates with that code rather than `UNIQUE`.

Drizzle can wrap the driver error and put the SQLite code on `cause`, so the whole `cause` chain is searched. Raw SQL, table or column names and driver messages are never part of the mapped error. Any other error is returned unchanged and must be handled as an internal error (never serialized to a client).

`ReferenceError` deliberately keeps the name from the backlog, but it shadows the JavaScript global of the same name in any module that imports it. Import it under an alias (`import { ReferenceError as DbReferenceError }`) if the global is also needed.

## Tables

_Delivered in Task 1.3._
