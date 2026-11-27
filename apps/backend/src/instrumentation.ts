/**
 * Runs once when the server starts (Next.js instrumentation hook). The import is dynamic and inside
 * the Node.js branch because the hook is also compiled for the Edge runtime, which has no `node:net`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertAlertFileConfig } = await import('./server/alerts/file-alert-dispatcher');
  const { assertAuditAnchorConfig } = await import('./server/audit/anchor');
  const { auditVerifyIntervalMs } = await import('./server/audit/scheduled-verification');
  const { lokiPushEndpoint } = await import('./server/audit/ship-loki');
  const { assertAuditSubjectConfig } = await import('./server/audit/subject');
  const { assertCaptchaConfig } = await import('./server/security/captcha');
  const { warnAboutClientIpConfiguration } = await import('./server/security/client-ip');
  assertCaptchaConfig();
  assertAuditSubjectConfig();
  assertAuditAnchorConfig();
  assertAlertFileConfig();
  auditVerifyIntervalMs();
  lokiPushEndpoint();
  warnAboutClientIpConfiguration();
  const { registerDetectionDispatchers } = await import('./server/detection/engine');
  const { db } = await import('./server/db/client');
  registerDetectionDispatchers(db);
}
