import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { FileAlertDispatcher } from '../alerts/file-alert-dispatcher';
import { type AuditContext, systemAudit } from '../audit/context';
import type { AuditAction } from '../audit/events';
import { sanitizeForLog } from '../audit/sanitize';
import type { AuditSubject } from '../audit/subject';
import type { AppDb, AppTransaction } from '../db/connection';
import { auditLog, type AuditLogRow, type SecurityEventSeverity } from '../db/schema';
import { registerAlertDispatcher } from '../security/alerts';
import { stageSecurityEvent } from '../security/events';
import { logEvent } from '../security/log-event';
import { WebhookAlertDispatcher } from '../security/webhook-alerts';
import { clock } from '../time/clock';
import type { DetectionAlertDetails } from './details';
import { failedLoginBurst } from './rules/failed-login-burst';
import { successAfterFailures } from './rules/success-after-failures';

type Detection = Pick<DetectionAlertDetails, 'count' | 'elapsedMs'> & {
  firstSeq: number;
  lastSeq: number;
};

export interface DetectionRule {
  id: string;
  title: string;
  severity: SecurityEventSeverity;
  threshold: number;
  windowMinutes: number;
  appliesTo: readonly AuditAction[];
  evaluate(context: { db: AppTransaction; entry: AuditLogRow; now: Date }): Detection | null;
}

export const DETECTION_RULES: readonly DetectionRule[] = [failedLoginBurst, successAfterFailures];
const COOLDOWN_MS = 5 * 60_000;

export function detectionRuleTitle(ruleId: string): string {
  return (
    DETECTION_RULES.find((rule) => rule.id === ruleId)?.title ??
    (ruleId === 'AUDIT_TAMPER' ? 'Audit log tampering' : 'Security detection')
  );
}

function isAlertFrom(ruleId: string) {
  return and(
    eq(auditLog.action, 'ALERT_RAISED'),
    eq(
      sql`case when json_valid(${auditLog.details}) then json_extract(${auditLog.details}, '$.ruleId') end`,
      ruleId,
    ),
  );
}

export function listDetectionRules(db: AppDb) {
  return DETECTION_RULES.map(({ id, title, severity, threshold, windowMinutes }) => {
    const latest = db
      .select({ time: auditLog.occurredAt })
      .from(auditLog)
      .where(isAlertFrom(id))
      .orderBy(desc(auditLog.occurredAt))
      .limit(1)
      .get();
    return { id, title, severity, threshold, windowMinutes, lastAlertAt: latest?.time ?? null };
  });
}

export function registerDetectionDispatchers(db: AppDb): void {
  registerAlertDispatcher(new FileAlertDispatcher(() => db.$client.name));
  registerAlertDispatcher(new WebhookAlertDispatcher(db));
}

/** Record both copies with one id and defer delivery until the whole transaction commits. */
export function stageDetectionAlert(
  db: AppDb,
  tx: AppTransaction,
  audit: AuditContext,
  detection: Omit<DetectionAlertDetails, 'alertId'>,
  subject?: AuditSubject,
) {
  const details = {
    ...detection,
    subject: detection.subject === null ? null : sanitizeForLog(detection.subject, 384),
    alertId: randomUUID(),
  };
  audit.record(tx, {
    action: 'ALERT_RAISED',
    outcome: 'SUCCESS',
    details,
    ...(subject && { subject }),
  });
  // Also register when invoked from a standalone maintenance process.
  registerDetectionDispatchers(db);
  return stageSecurityEvent(tx, {
    type: 'DETECTION_ALERT',
    details,
    requestId: audit.requestId,
  })!;
}

export function isDetectionInput(entry: AuditLogRow): boolean {
  return (
    entry.action !== 'ALERT_RAISED' &&
    entry.action !== 'AUDIT_TAMPER_DETECTED' &&
    !entry.action.startsWith('AUDIT_LOG_')
  );
}

export function runDetection(
  db: AppDb,
  entry: AuditLogRow,
  rules: readonly DetectionRule[] = DETECTION_RULES,
): void {
  if (!isDetectionInput(entry)) return;

  const subject = entry.subjectLogin ?? entry.subjectRef;
  if (!subject) return;
  const known = entry.subjectLogin !== null;
  const column = known ? auditLog.subjectLogin : auditLog.subjectRef;

  for (const rule of rules) {
    if (!rule.appliesTo.some((action) => action === entry.action)) continue;
    try {
      const staged = db.transaction(
        (tx) => {
          const result = rule.evaluate({ db: tx, entry, now: new Date(entry.occurredAt) });
          if (!result) return;
          const cutoff = new Date(clock.now().getTime() - COOLDOWN_MS).toISOString();
          const recent = tx
            .select({ seq: auditLog.seq })
            .from(auditLog)
            .where(and(isAlertFrom(rule.id), eq(column, subject), gt(auditLog.occurredAt, cutoff)))
            .limit(1)
            .get();
          if (recent) return;
          return stageDetectionAlert(
            db,
            tx,
            systemAudit(entry.requestId),
            {
              ...result,
              ruleId: rule.id,
              severity: rule.severity,
              subject,
              windowMinutes: rule.windowMinutes,
              auditSeq: entry.seq,
            },
            known ? { subjectLogin: subject } : { subjectRef: subject },
          );
        },
        { behavior: 'immediate' },
      );
      staged?.afterCommit(db);
    } catch {
      logEvent('detection.rule_failed', entry.requestId);
    }
  }
}

export function detectAfterAuditCommit(db: AppDb, entries: readonly AuditLogRow[]): void {
  const candidates = entries.filter((entry) =>
    DETECTION_RULES.some((rule) => rule.appliesTo.some((action) => action === entry.action)),
  );
  // Let the request continue before evaluating the committed login entries.
  if (candidates.length)
    setImmediate(() => {
      for (const entry of candidates) runDetection(db, entry);
    });
}
