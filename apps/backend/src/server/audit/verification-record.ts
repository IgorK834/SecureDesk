import { desc, eq } from 'drizzle-orm';
import type { AppDb, AppTransaction } from '../db/connection';
import { auditLog } from '../db/schema';
import type { AuditContext } from './context';
import { verifyAuditChain, type AuditVerification } from './verify';
import { intactVerificationDetails, tamperedVerificationDetails } from './verification-types';

export async function verifyAndRecord(db: AppDb, audit: AuditContext) {
  return recordVerification(db, audit, await verifyAuditChain(db));
}

export function recordVerification(
  db: AppDb | AppTransaction,
  audit: AuditContext,
  result: AuditVerification,
) {
  const { checkedEntries, warnings } = result;
  const summary = { checkedEntries, warnings };
  const recorded = audit.record(db, {
    action: 'AUDIT_LOG_VERIFIED',
    outcome: result.status === 'INTACT' ? 'SUCCESS' : 'FAILURE',
    details:
      result.status === 'INTACT' ? summary : { ...summary, firstProblem: result.firstProblem },
  });
  return { ...result, verifiedAt: recorded!.occurredAt };
}

export function latestVerificationEntry(db: AppDb | AppTransaction) {
  return db
    .select({
      details: auditLog.details,
      outcome: auditLog.outcome,
      verifiedAt: auditLog.occurredAt,
    })
    .from(auditLog)
    .where(eq(auditLog.action, 'AUDIT_LOG_VERIFIED'))
    .orderBy(desc(auditLog.seq))
    .limit(1)
    .get();
}

export function latestAuditVerification(db: AppDb) {
  const latest = latestVerificationEntry(db);
  if (!latest) return { verification: null };

  const details: unknown = JSON.parse(latest.details);
  const { verifiedAt } = latest;
  return {
    verification:
      latest.outcome === 'SUCCESS'
        ? { status: 'INTACT' as const, verifiedAt, ...intactVerificationDetails.parse(details) }
        : {
            status: 'TAMPERED' as const,
            verifiedAt,
            ...tamperedVerificationDetails.parse(details),
          },
  };
}
