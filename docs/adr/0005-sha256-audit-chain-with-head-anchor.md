---
status: accepted
date: 2026-11-27
---

# Make the audit log tamper-evident with a SHA-256 chain and a head anchor

## Context and problem statement

An audit log that an attacker with database access can edit silently is worth little. Detecting
changes, deletions and truncation is the goal; preventing them from a privileged database user is
not achievable inside the same database.

## Considered options

- Append-only table with triggers only.
- Hash chain over the canonical entry, plus an external witness of the chain head.
- An external immutable store (WORM bucket, ledger database).

## Decision outcome

Each entry stores `prev_hash` and `entry_hash` over a canonical form tagged `sd-audit-v1`; details
are serialized with sorted keys. The latest `(seq, hash)` is written to a head anchor file outside
the database, so removing the tail is reported as `HEAD_MISMATCH`. Verification runs on a schedule
and on demand.

## Consequences

- Good: edits, deletions in the middle and tail truncation are detected.
- Bad: a coordinated rewrite of both the chain and the local anchor is not detected; an off-host
  copy of the anchor closes that gap.
- Bad: the canonical format is a compatibility contract. Any migration must keep `sd-audit-v1`
  byte-for-byte (decision D4-03).

## Related

[audit-log](../audit-log.md), `apps/backend/src/server/audit/chain.ts`
