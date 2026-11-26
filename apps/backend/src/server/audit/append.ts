import { randomUUID } from 'node:crypto';
import { desc, sql } from 'drizzle-orm';
import type { AppDb, AppTransaction } from '../db/connection';
import { auditLog, type AuditLogRow } from '../db/schema';
import { clock, type Clock } from '../time/clock';
import { canonicalDetails, canonicalize, computeEntryHash, GENESIS_HASH } from './chain';
import { validateAuditEvent } from './events';
import { sanitizeForLog } from './sanitize';

export interface AuditEntryInput {
  action: string;
  outcome: AuditLogRow['outcome'];
  details: unknown;
  actorType: AuditLogRow['actorType'];
  actorUserId?: string | null;
  actorLogin?: string | null;
  subjectLogin?: string | null;
  subjectRef?: string | null;
  ip?: string | null;
  requestId: string;
}

function safeText(value: string | null | undefined, limit: number): string | null {
  return value == null ? null : sanitizeForLog(value, limit);
}

export function appendAuditEntry(
  db: AppDb | AppTransaction,
  input: AuditEntryInput,
  time: Clock = clock,
): AuditLogRow {
  const { description, details } = validateAuditEvent(input.action, input.outcome, input.details);

  // Drizzle uses BEGIN IMMEDIATE on an AppDb and a savepoint on an existing transaction.
  return db.transaction(
    (tx) => {
      const head = tx
        .select({ seq: auditLog.seq, entryHash: auditLog.entryHash })
        .from(auditLog)
        .orderBy(desc(auditLog.seq))
        .limit(1)
        .get();
      const { seq } = tx.get<{ seq: number }>(
        sql`SELECT coalesce(max(seq), 0) + 1 AS seq FROM sqlite_sequence WHERE name = 'audit_log'`,
      );
      const content = {
        seq,
        id: randomUUID(),
        occurredAt: time.now().toISOString(),
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        actorLogin: safeText(input.actorLogin, 384),
        subjectLogin: safeText(input.subjectLogin, 384),
        subjectRef: safeText(input.subjectRef, 20),
        ip: safeText(input.ip, 64),
        action: input.action,
        description,
        outcome: input.outcome,
        details: canonicalDetails(details),
        requestId: sanitizeForLog(input.requestId, 128),
      };
      const prevHash = head?.entryHash ?? GENESIS_HASH;
      const row = {
        ...content,
        prevHash,
        entryHash: computeEntryHash(prevHash, canonicalize(content)),
      };
      tx.insert(auditLog).values(row).run();
      return row;
    },
    { behavior: 'immediate' },
  );
}
