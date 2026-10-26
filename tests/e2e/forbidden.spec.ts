import path from 'node:path';
import { expect, test } from '@playwright/test';
import { credentials, EVIDENCE_DIR, login } from './helpers';

test('section 11.4: a valid Guest session receives HTTP 403 from the admin API', async ({
  page,
}) => {
  await login(page, credentials().guest);
  await expect(page.getByRole('heading', { name: 'Guest dashboard' })).toBeVisible();

  const response = await page.request.get('/api/admin/users');
  expect(response.status()).toBe(403);
  const body = await response.json();
  expect(body).toMatchObject({ error: { code: 'AUTH_FORBIDDEN' } });

  await page.setContent(`
    <main style="font: 18px system-ui; max-width: 900px; margin: 60px auto">
      <h1>Guest API authorization check</h1>
      <p>Authenticated account: <strong>guest1 (Guest)</strong></p>
      <p>Request: <code>GET /api/admin/users</code></p>
      <p>HTTP status: <strong>403 Forbidden</strong></p>
      <pre style="background:#111;color:#eee;padding:20px">${JSON.stringify(body, null, 2)}</pre>
      <p>No cookie or CSRF token is displayed.</p>
    </main>
  `);
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, '06-http-403-guest-admin-api.png'),
    fullPage: true,
  });
});
