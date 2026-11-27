import { and, count, desc, eq, gt, gte, lt, lte, min } from 'drizzle-orm';
import { canonicalDetails } from '../../audit/chain';
import { auditLog } from '../../db/schema';
import type { DetectionRule } from '../engine';

const threshold = 3;
const windowMinutes = 10;
const wrongPassword = canonicalDetails({ reason: 'BAD_CREDENTIALS' });

export const successAfterFailures: DetectionRule = {
  id: 'SUCCESS_AFTER_FAILURES',
  title: 'Successful login after failed attempts',
  severity: 'CRITICAL',
  threshold,
  windowMinutes,
  appliesTo: ['AUTH_LOGIN_SUCCESS'],
  evaluate({ db, entry, now }) {
    if (!entry.subjectLogin) return null;
    const sameAccount = eq(auditLog.subjectLogin, entry.subjectLogin);
    const lastSuccess = db
      .select({ seq: auditLog.seq })
      .from(auditLog)
      .where(
        and(sameAccount, eq(auditLog.action, 'AUTH_LOGIN_SUCCESS'), lt(auditLog.seq, entry.seq)),
      )
      .orderBy(desc(auditLog.seq))
      .limit(1)
      .get();
    const result = db
      .select({ count: count(), firstSeq: min(auditLog.seq), earliest: min(auditLog.occurredAt) })
      .from(auditLog)
      .where(
        and(
          sameAccount,
          eq(auditLog.action, 'AUTH_LOGIN_FAILURE'),
          eq(auditLog.details, wrongPassword),
          gt(auditLog.seq, lastSuccess?.seq ?? 0),
          lt(auditLog.seq, entry.seq),
          gte(auditLog.occurredAt, new Date(now.getTime() - windowMinutes * 60_000).toISOString()),
          lte(auditLog.occurredAt, now.toISOString()),
        ),
      )
      .get()!;
    return result.count >= threshold
      ? {
          count: result.count,
          firstSeq: result.firstSeq!,
          lastSeq: entry.seq,
          elapsedMs: now.getTime() - Date.parse(result.earliest!),
        }
      : null;
  },
};
