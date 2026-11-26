import { setImmediate } from 'node:timers/promises';
import { desc, eq } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { auditLog } from '../db/schema';
import { ApiError } from '../http/errors';
import { stageDetectionAlert } from '../detection/engine';
import { logEvent } from '../security/log-event';
import { clock } from '../time/clock';
import { canonicalDetails } from './chain';
import { systemAudit } from './context';
import { latestVerificationEntry, recordVerification } from './verification-record';
import { verifyAuditChain } from './verify';

const MINUTE_MS = 60_000;
const nextCheckAt = new WeakMap<AppDb, number>();

export function auditVerifyIntervalMs(): number {
  const minutes = Number(process.env.AUDIT_VERIFY_INTERVAL_MINUTES?.trim() || '60');
  const interval = minutes * MINUTE_MS;
  if (!Number.isSafeInteger(minutes) || !Number.isSafeInteger(interval) || minutes < 1) {
    throw new Error('AUDIT_VERIFY_INTERVAL_MINUTES must be a positive integer in minutes.');
  }
  return interval;
}

/** Shared system verification for the write path and the explicit CLI. */
export async function runAuditVerification(db: AppDb, dueBefore?: number) {
  const audit = systemAudit();
  const result = await verifyAuditChain(db);
  const saved = db.transaction(
    (tx) => {
      const previous = latestVerificationEntry(tx);
      // A separate process might have verified while this one was scanning.
      if (dueBefore !== undefined && previous && Date.parse(previous.verifiedAt) > dueBefore) {
        return undefined;
      }
      const report = recordVerification(tx, audit, result);
      if (result.status === 'INTACT') return { report };

      const details = { firstProblem: result.firstProblem };
      const lastFinding = tx
        .select({ details: auditLog.details })
        .from(auditLog)
        .where(eq(auditLog.action, 'AUDIT_TAMPER_DETECTED'))
        .orderBy(desc(auditLog.seq))
        .limit(1)
        .get();
      const finding = audit.record(tx, {
        action: 'AUDIT_TAMPER_DETECTED',
        outcome: 'FAILURE',
        details,
      });
      if (previous?.outcome !== 'SUCCESS' && lastFinding?.details === canonicalDetails(details)) {
        return { report };
      }
      const alert = stageDetectionAlert(db, tx, audit, {
        ruleId: 'AUDIT_TAMPER',
        severity: 'CRITICAL',
        subject: null,
        count: 1,
        windowMinutes: 0,
        auditSeq: finding!.seq,
      });
      return { report, alert };
    },
    { behavior: 'immediate' },
  );
  saved?.alert?.afterCommit(db);
  return saved?.report;
}

/** Triggered after commit. The originating write is never waiting for a scan or alert. */
export async function verifyIfDue(db: AppDb) {
  const now = clock.now().getTime();
  if (now < (nextCheckAt.get(db) ?? -Infinity)) return undefined;
  let interval: number;
  try {
    interval = auditVerifyIntervalMs();
  } catch {
    nextCheckAt.set(db, now + 60 * MINUTE_MS);
    logEvent('audit.verification.schedule_failed', 'system');
    return undefined;
  }
  nextCheckAt.set(db, now + interval);
  await setImmediate();

  try {
    const verifiedAt = Date.parse(latestVerificationEntry(db)?.verifiedAt ?? '');
    if (verifiedAt + interval > now) {
      nextCheckAt.set(db, verifiedAt + interval);
      return undefined;
    }
    const result = await runAuditVerification(db, now - interval);
    if (result) nextCheckAt.set(db, Date.parse(result.verifiedAt) + interval);
    return result;
  } catch (error) {
    if (error instanceof ApiError && error.code === 'VERIFICATION_IN_PROGRESS') {
      nextCheckAt.delete(db);
    } else {
      logEvent('audit.verification.schedule_failed', 'system');
    }
    return undefined;
  }
}
