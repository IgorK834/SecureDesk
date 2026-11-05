import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  E2E_DATABASE_PATH,
  MODULE_2_EVIDENCE_DIR,
  credentials,
  login,
  submitLogin,
} from './helpers';

test('SEC-58: an administrator reviews and acknowledges a trap alert while other roles are refused', async ({
  browser,
  page,
}) => {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.prepare('DELETE FROM security_events').run();
  } finally {
    database.close();
  }

  await login(page, credentials().admin);
  await expect(page.getByRole('link', { name: 'Security events', exact: true })).toBeVisible();

  const trapContext = await browser.newContext();
  const trapPage = await trapContext.newPage();
  await submitLogin(trapPage, { login: 'backup_admin', password: 'not-a-real-password' });
  await expect(trapPage.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  await trapContext.close();

  await page.goto('/admin/security-events');
  const banner = page.getByRole('alert').filter({ hasText: 'unacknowledged critical' });
  await expect(banner).toContainText('1 unacknowledged critical');
  await expect(
    page.locator('tbody strong').filter({ hasText: /^HONEYTOKEN_TRIGGERED$/ }),
  ).toBeVisible();
  await expect(page.getByText('Backup administrator account', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.getByText('Security event acknowledged.')).toBeVisible();
  await expect(banner).toBeHidden();

  await page.getByRole('button', { name: 'Send test alert' }).first().click();
  await expect(page.getByText(/Test alert sent for/)).toBeVisible();
  await expect(
    page.locator('tbody strong').filter({ hasText: /^HONEYTOKEN_TESTED$/ }),
  ).toBeVisible();
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-08-security-events.png'),
    fullPage: true,
  });

  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await login(managerPage, credentials().manager);
  await expect(managerPage.getByRole('link', { name: 'Security events', exact: true })).toHaveCount(
    0,
  );
  await managerPage.goto('/admin/security-events');
  await expect(managerPage).toHaveURL(/\/forbidden$/);
  await managerContext.close();
});
