/**
 * Runs once when the server starts (Next.js instrumentation hook). The import is dynamic and inside
 * the Node.js branch because the hook is also compiled for the Edge runtime, which has no `node:net`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { assertCaptchaConfig } = await import('./server/security/captcha');
  const { warnAboutClientIpConfiguration } = await import('./server/security/client-ip');
  assertCaptchaConfig();
  warnAboutClientIpConfiguration();
}
