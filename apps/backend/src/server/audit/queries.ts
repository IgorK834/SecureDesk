import { createHash } from 'node:crypto';
import { and, count, desc, eq, gt, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { AppDb, AppTransaction } from '../db/connection';
import { auditLog, type AuditLogRow } from '../db/schema';
import { NotFoundError } from '../http/errors';
import { clock } from '../time/clock';
import { canonicalDetails } from './chain';
import type { AuditContext } from './context';
import { AUDIT_ACTION_CODES, type AuditFilters, type AuditListRequest } from './schemas';

export function auditFilter({ user, action, outcome, from, to, fromSeq, toSeq }: AuditFilters) {
  const pattern = user === undefined ? undefined : '%' + user.replace(/[\\%_]/g, '\\$&') + '%';
  return and(
    pattern === undefined
      ? undefined
      : or(
          sql`${auditLog.actorLogin} LIKE ${pattern} ESCAPE '\\'`,
          sql`${auditLog.subjectLogin} LIKE ${pattern} ESCAPE '\\'`,
          sql`${auditLog.actorUserId} LIKE ${pattern} ESCAPE '\\'`,
        ),
    action && inArray(auditLog.action, action),
    outcome && eq(auditLog.outcome, outcome),
    from ? gte(auditLog.occurredAt, from) : undefined,
    to ? lte(auditLog.occurredAt, to) : undefined,
    fromSeq ? gte(auditLog.seq, fromSeq) : undefined,
    toSeq ? lte(auditLog.seq, toSeq) : undefined,
  );
}

function toAuditEntry(row: AuditLogRow) {
  return {
    seq: row.seq,
    id: row.id,
    occurredAt: row.occurredAt,
    actor: { type: row.actorType, userId: row.actorUserId, login: row.actorLogin },
    subject: { login: row.subjectLogin, ref: row.subjectRef },
    ip: row.ip,
    action: row.action,
    description: row.description,
    outcome: row.outcome,
    details: JSON.parse(row.details) as Record<string, unknown>,
    requestId: row.requestId,
    prevHash: row.prevHash,
    entryHash: row.entryHash,
  };
}

const VIEW_INTERVAL_MS = 5 * 60 * 1000;

function recordView(tx: AppTransaction, audit: AuditContext, sessionId: string): void {
  const sessionRef = createHash('sha256').update(sessionId).digest('hex');
  const details = { sessionRef };
  const since = new Date(clock.now().getTime() - VIEW_INTERVAL_MS).toISOString();
  const previous = tx
    .select({ seq: auditLog.seq })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, 'AUDIT_LOG_VIEWED'),
        gt(auditLog.occurredAt, since),
        eq(auditLog.details, canonicalDetails(details)),
      ),
    )
    .limit(1)
    .get();
  if (!previous) audit.record(tx, { action: 'AUDIT_LOG_VIEWED', outcome: 'SUCCESS', details });
}

export function listAuditEntries(
  db: AppDb,
  query: AuditListRequest,
  audit: AuditContext,
  sessionId: string,
) {
  return db.transaction(
    (tx) => {
      // Include the view entry in the first snapshot so the read itself cannot shift the next page.
      recordView(tx, audit, sessionId);
      const where = auditFilter(query);
      const { page, pageSize } = query;
      const { total } = tx.select({ total: count() }).from(auditLog).where(where).get()!;
      const items = tx
        .select()
        .from(auditLog)
        .where(where)
        .orderBy(desc(auditLog.seq))
        .limit(pageSize)
        .offset((page - 1) * pageSize)
        .all()
        .map(toAuditEntry);
      return { items, total, page, pageSize, actions: AUDIT_ACTION_CODES };
    },
    { behavior: 'immediate' },
  );
}

export function getAuditEntry(db: AppDb, seq: number, audit: AuditContext, sessionId: string) {
  return db.transaction(
    (tx) => {
      const row = tx.select().from(auditLog).where(eq(auditLog.seq, seq)).get();
      if (!row) throw new NotFoundError();
      recordView(tx, audit, sessionId);
      return toAuditEntry(row);
    },
    { behavior: 'immediate' },
  );
}
