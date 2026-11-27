---
status: proposed
date: 2026-11-27
---

# Limit API keys to ticket scopes

## Context and problem statement

Integrations need credentials that are not interactive sessions. A key that could carry any of the
26 permissions would turn a leaked key into administrative access.

## Considered options

- Keys inherit the full permission set of their owner.
- Keys carry an explicit subset of ticket scopes only.

## Decision outcome

Keys are issued to Manager, Employee and Guest only. They hold ticket scopes and never
`users:*`, `security-*`, `audit-log:*`, `api-keys:*` or `webhooks:*`. The Administrator has no
ticket access by design and gets no keys (decision D4-05). Only a peppered digest of the key is
stored.

## Consequences

- Good: the worst case of a leaked key is bounded to ticket data its owner could already see.
- Bad: automation of administrative tasks through keys is not possible in v1.

## Related

SD-114, SD-116 in the Module 4 backlog; [permissions](../permissions.md)
