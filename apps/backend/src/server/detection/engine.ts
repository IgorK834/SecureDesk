import { randomUUID } from 'node:crypto';
import { FileAlertDispatcher } from '../alerts/file-alert-dispatcher';
import { sanitizeForLog } from '../audit/sanitize';
import type { AuditContext } from '../audit/context';
import type { AppDb, AppTransaction } from '../db/connection';
import { registerAlertDispatcher } from '../security/alerts';
import { stageSecurityEvent } from '../security/events';
import { WebhookAlertDispatcher } from '../security/webhook-alerts';
import type { DetectionAlertDetails } from './details';

/** Record both copies with one id and defer delivery until the whole transaction commits. */
export function stageDetectionAlert(
  db: AppDb,
  tx: AppTransaction,
  audit: AuditContext,
  detection: Omit<DetectionAlertDetails, 'alertId'>,
) {
  const details = {
    ...detection,
    subject: detection.subject === null ? null : sanitizeForLog(detection.subject, 384),
    alertId: randomUUID(),
  };
  audit.record(tx, { action: 'ALERT_RAISED', outcome: 'SUCCESS', details });
  registerAlertDispatcher(new FileAlertDispatcher(db.$client.name));
  registerAlertDispatcher(new WebhookAlertDispatcher(db));
  return stageSecurityEvent(tx, {
    type: 'DETECTION_ALERT',
    details,
    requestId: audit.requestId,
  })!;
}
