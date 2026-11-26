import { and, asc, count, gt, lte, max, min } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { auditLog, type AuditLogRow } from '../db/schema';
import { ApiError } from '../http/errors';
import { clock } from '../time/clock';
import type { AuditContext } from './context';
import { auditFilter } from './queries';
import type { AuditExportRequest, AuditFilters } from './schemas';

const DEFAULT_MAX_ROWS = 100_000;
const BATCH_SIZE = 500;
const COLUMNS = [
  'seq',
  'id',
  'occurred_at',
  'actor_type',
  'actor_user_id',
  'actor_login',
  'subject_login',
  'subject_ref',
  'ip',
  'action',
  'description',
  'outcome',
  'details',
  'request_id',
  'prev_hash',
  'entry_hash',
] as const;

function toExportRow(row: AuditLogRow): Record<(typeof COLUMNS)[number], string | number | null> {
  return {
    seq: row.seq,
    id: row.id,
    occurred_at: row.occurredAt,
    actor_type: row.actorType,
    actor_user_id: row.actorUserId,
    actor_login: row.actorLogin,
    subject_login: row.subjectLogin,
    subject_ref: row.subjectRef,
    ip: row.ip,
    action: row.action,
    description: row.description,
    outcome: row.outcome,
    details: row.details,
    request_id: row.requestId,
    prev_hash: row.prevHash,
    entry_hash: row.entryHash,
  };
}

function csvCell(value: string | number | null): string {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return /[",\r\n]/.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

function exportLimit(): number {
  const value = process.env.AUDIT_EXPORT_MAX_ROWS?.trim();
  if (!value) return DEFAULT_MAX_ROWS;
  const limit = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(limit)) {
    throw new Error('AUDIT_EXPORT_MAX_ROWS must be a positive integer.');
  }
  return limit;
}

function streamEntries(
  db: AppDb,
  filters: AuditFilters,
  format: AuditExportRequest['format'],
  lastSeq: number,
): ReadableStream<Uint8Array> {
  const where = and(auditFilter(filters), lte(auditLog.seq, lastSeq));
  const encoder = new TextEncoder();
  let cursor = 0;
  return new ReadableStream({
    start(controller) {
      if (format === 'csv') controller.enqueue(encoder.encode(COLUMNS.join(',') + '\r\n'));
    },
    pull(controller) {
      const batch = db
        .select()
        .from(auditLog)
        .where(and(where, gt(auditLog.seq, cursor)))
        .orderBy(asc(auditLog.seq))
        .limit(BATCH_SIZE)
        .all();
      if (batch.length === 0) {
        controller.close();
        return;
      }
      cursor = batch.at(-1)!.seq;
      const chunk = batch
        .map((row) => {
          const exported = toExportRow(row);
          return format === 'csv'
            ? COLUMNS.map((column) => csvCell(exported[column])).join(',') + '\r\n'
            : JSON.stringify(exported) + '\n';
        })
        .join('');
      controller.enqueue(encoder.encode(chunk));
      if (cursor >= lastSeq) controller.close();
    },
  });
}

export function exportAuditEntries(
  db: AppDb,
  { format, ...filters }: AuditExportRequest,
  audit: AuditContext,
): Response {
  const limit = exportLimit();
  const lastSeq = db.transaction(
    (tx) => {
      const { rowCount, firstSeq, lastSeq } = tx
        .select({
          rowCount: count(),
          firstSeq: min(auditLog.seq),
          lastSeq: max(auditLog.seq),
        })
        .from(auditLog)
        .where(auditFilter(filters))
        .get()!;
      if (rowCount > limit) {
        throw new ApiError(400, 'EXPORT_TOO_LARGE', 'Zakres eksportu jest zbyt duży. Zawęź filtry');
      }
      audit.record(tx, {
        action: 'AUDIT_LOG_EXPORTED',
        outcome: 'SUCCESS',
        details: { filters, format, rowCount, firstSeq, lastSeq },
      });
      return lastSeq ?? 0;
    },
    { behavior: 'immediate' },
  );

  const timestamp = clock.now().toISOString().replaceAll(':', '-');
  return new Response(streamEntries(db, filters, format, lastSeq), {
    headers: {
      'Content-Type':
        format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson; charset=utf-8',
      'Content-Disposition': 'attachment; filename="audit-log-' + timestamp + '.' + format + '"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
