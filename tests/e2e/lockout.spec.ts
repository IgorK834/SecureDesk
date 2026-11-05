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

function clearAttempts(): string {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.prepare('DELETE FROM login_attempts').run();
    return (
      database.prepare("SELECT id FROM users WHERE login_normalized = 'employee1'").get() as {
        id: string;
      }
    ).id;
  } finally {
    database.close();
  }
}

test('SEC-31/SEC-38: five failures show the countdown and an administrator unlocks the account', async ({
  browser,
  page,
}) => {
  const employeeId = clearAttempts();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await submitLogin(page, {
      login: credentials().employee.login,
      password: 'FAKE-ONLY-WRONG-PASSWORD!',
    });
    if (attempt < 5)
      await expect(page.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  }

  await expect(page.getByRole('alert')).toContainText('Too many failed attempts.');
  await expect(page.getByRole('alert')).toContainText(/Try again in 15:00|Try again in 14:59/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-01-account-lockout.png'),
    fullPage: true,
    mask: [page.getByLabel('Password'), page.getByLabel('Reversed characters')],
  });

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, credentials().admin);
  await adminPage.goto(`/admin/users/${employeeId}`);
  await expect(adminPage.getByText(/Locked until/)).toBeVisible();
  await adminPage.getByRole('button', { name: 'Unlock', exact: true }).click();
  await adminPage
    .getByRole('dialog', { name: 'Unlock this account?' })
    .getByRole('button', { name: 'Unlock account' })
    .click();
  await expect(
    adminPage.getByText('Account unlocked. Its failed-login counter was cleared.'),
  ).toBeVisible();
  await adminContext.close();

  await page.goto('/login');
  await login(page, credentials().employee);
  await expect(page).toHaveURL(/\/dashboard$/);
});
