---
status: proposed
date: 2026-11-27
---

# Use PostgreSQL only, with Testcontainers

## Context and problem statement

SQLite ([ADR 0007](0007-sqlite-as-the-database.md)) limits SecureDesk to one writer and one
process, and offers no database roles. Supporting both engines would double migrations, triggers
and test paths.

## Considered options

- Keep SQLite, add PostgreSQL as an option.
- Move to PostgreSQL and drop SQLite.

## Decision outcome

PostgreSQL only (decision D4-01). Tests use `@testcontainers/postgresql` with a migrated template
database cloned per test file. Two roles, `securedesk_migrator` and `securedesk_app`, separate
schema changes from runtime access. The `sd-audit-v1` format is unchanged (D4-03).

## Consequences

- Good: one dialect, one migration history, one trigger implementation, least-privilege runtime.
- Bad: the zero-setup demo is gone; `docker compose up` replaces it. Tests need Docker.

## Related

SD-104 to SD-109 in the Module 4 backlog.
