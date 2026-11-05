import path from 'node:path';
import { expect, test } from '@playwright/test';
import { MODULE_2_EVIDENCE_DIR, credentials, installTurnstileStub, login } from './helpers';

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

test('SEC-43/SEC-44: password change uses hermetic Turnstile and a forged token is rejected by the API', async ({
  page,
}) => {
  await installTurnstileStub(page);
  await login(page, credentials().employee);
  await page.goto('/account/change-password');
  await expect(page.getByText('Verification complete.')).toBeVisible();

  await page.getByLabel('Current password').fill(credentials().employee.password);
  await page
    .getByLabel('New password', { exact: true })
    .fill('E2E-only-replacement-not-submitted!7');
  await page.getByLabel('Confirm new password').fill('E2E-only-replacement-not-submitted!7');
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-03-password-change-captcha.png'),
    fullPage: true,
    mask: [page.locator('input[type="password"]')],
  });

  const xsrf = (await page.context().cookies()).find(({ name }) => name === 'XSRF-TOKEN')?.value;
  expect(xsrf).toBeTruthy();
  const response = await page.request.post('/api/auth/change-password', {
    headers: {
      Origin: 'http://localhost:4200',
      'X-XSRF-TOKEN': xsrf as string,
    },
    data: {
      currentPassword: 'FAKE-ONLY-CURRENT-PASSWORD!',
      newPassword: 'FAKE-ONLY-NEW-PASSWORD!7',
      confirmNewPassword: 'FAKE-ONLY-NEW-PASSWORD!7',
      captcha: { token: 'forged-token' },
    },
  });
  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(body).toMatchObject({ error: { code: 'CAPTCHA_FAILED' } });

  await page.setContent(`
    <main style="font:18px system-ui;max-width:900px;margin:60px auto">
      <h1>Server-side CAPTCHA rejection</h1>
      <p>Request: <code>POST /api/auth/change-password</code></p>
      <p>HTTP status: <strong>403 Forbidden</strong></p>
      <pre style="background:#111;color:#eee;padding:20px">${escapeHtml(JSON.stringify(body, null, 2))}</pre>
      <p>The submitted proof, session cookie and CSRF value are intentionally omitted.</p>
    </main>
  `);
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-04-request-without-token-rejected.png'),
    fullPage: true,
  });
});
