---
status: superseded by 0010-postgresql-only.md
date: 2026-11-27
---

# Use SQLite with Drizzle ORM

## Context and problem statement

The course project needs a relational store that a reviewer can run with no setup.

## Considered options

- SQLite through `better-sqlite3` and Drizzle.
- PostgreSQL in a container.

## Decision outcome

SQLite with write-ahead logging, Drizzle schema and migrations under
`apps/backend/src/server/db`. Triggers keep the audit log append-only.

## Consequences

- Good: zero setup, a database file per test.
- Bad: a single writer and a single process; no roles, so the application connects with full rights
  to its own file.
- Superseded when the platform needs concurrent writers, least-privilege roles and shared state.

## Related

[ADR 0010](0010-postgresql-only.md), [database-schema](../database-schema.md)
