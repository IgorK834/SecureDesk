import { and, count, eq, gt, inArray, lte, min } from 'drizzle-orm';
import { canonicalDetails } from '../../audit/chain';
import { auditLog } from '../../db/schema';
import type { DetectionRule } from '../engine';

const threshold = 5;
const windowMinutes = 5;
const reasons = ['BAD_CREDENTIALS', 'ACCOUNT_LOCKED'].map((reason) => canonicalDetails({ reason }));

export const failedLoginBurst: DetectionRule = {
  id: 'FAILED_LOGIN_BURST',
  title: 'Burst of failed logins',
  severity: 'WARNING',
  threshold,
  windowMinutes,
  appliesTo: ['AUTH_LOGIN_FAILURE'],
  evaluate({ db, entry, now }) {
    const value = entry.subjectLogin ?? entry.subjectRef;
    if (!value || !reasons.includes(entry.details)) return null;
    const column = entry.subjectLogin === null ? auditLog.subjectRef : auditLog.subjectLogin;
    const result = db
      .select({ count: count(), firstSeq: min(auditLog.seq) })
      .from(auditLog)
      .where(
        and(
          eq(column, value),
          eq(auditLog.action, 'AUTH_LOGIN_FAILURE'),
          inArray(auditLog.details, reasons),
          gt(auditLog.occurredAt, new Date(now.getTime() - windowMinutes * 60_000).toISOString()),
          lte(auditLog.occurredAt, now.toISOString()),
          lte(auditLog.seq, entry.seq),
        ),
      )
      .get()!;
    return result.count >= threshold
      ? { count: result.count, firstSeq: result.firstSeq!, lastSeq: entry.seq }
      : null;
  },
};
