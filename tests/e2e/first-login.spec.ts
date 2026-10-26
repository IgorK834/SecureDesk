import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  closeTemporaryPassword,
  createEmployee,
  credentials,
  EVIDENCE_DIR,
  freshPassword,
  login,
  logout,
} from './helpers';

test('section 11.2: administrator creates an Employee who must replace the temporary password', async ({
  page,
}) => {
  await login(page, credentials().admin);
  await expect(page.getByRole('heading', { name: 'Administrator dashboard' })).toBeVisible();

  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '04-admin-users.png'), fullPage: true });

  await page.goto('/admin/security');
  await expect(page.getByRole('heading', { name: 'Security settings' })).toBeVisible();
  await expect(page.getByLabel('Minimum password length')).toHaveValue('12');
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, '04b-admin-security-settings.png'),
    fullPage: true,
  });

  const created = await createEmployee(page, 'e2e-first-login');
  const passwordField = page.getByRole('dialog').getByLabel('Temporary password');
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, '05-temporary-password-reveal.png'),
    fullPage: true,
    mask: [passwordField],
  });
  await closeTemporaryPassword(page);
  await expect(page.locator('body')).not.toContainText(created.temporaryPassword);
  expect(page.url()).not.toContain(created.temporaryPassword);
  expect(
    await page.evaluate(() => ({
      local: Object.values(localStorage),
      session: Object.values(sessionStorage),
    })),
  ).toEqual({ local: [], session: [] });
  await page.reload();
  await expect(page.locator('body')).not.toContainText(created.temporaryPassword);
  await logout(page);

  await login(page, { login: created.login, password: created.temporaryPassword });
  await expect(page).toHaveURL(/\/change-initial-password$/);
  await expect(page.getByText('Your temporary password must be replaced')).toBeVisible();
  await page.screenshot({
    path: path.join(EVIDENCE_DIR, '02-forced-password-change.png'),
    fullPage: true,
    mask: [page.locator('input[type="password"]')],
  });

  const permanentPassword = freshPassword();
  await page.getByLabel('New password', { exact: true }).fill(permanentPassword);
  await page.getByLabel('Confirm new password', { exact: true }).fill(permanentPassword);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Employee dashboard' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Employee dashboard' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(created.temporaryPassword);
});
