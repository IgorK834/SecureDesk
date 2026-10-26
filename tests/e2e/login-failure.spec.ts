import path from 'node:path';
import { expect, test } from '@playwright/test';
import { credentials, EVIDENCE_DIR } from './helpers';

test.describe('failed login evidence (SEC-01)', () => {
  for (const [name, loginName] of [
    ['wrong password', 'known-user'],
    ['unknown login', 'unknown-e2e-user'],
  ] as const) {
    test(`${name} shows the same neutral message`, async ({ page }) => {
      await page.goto('/login');
      await page
        .getByLabel('Login')
        .fill(loginName === 'known-user' ? credentials().employee.login : loginName);
      await page.getByLabel('Password').fill('not-the-password');
      await page.getByRole('button', { name: 'Sign in' }).click();

      const alert = page.getByRole('alert');
      await expect(alert).toHaveText('Login lub hasło niepoprawne');
      await expect(page.getByLabel('Password')).toHaveValue('');
      if (name === 'wrong password') {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, '01-failed-login.png'),
          fullPage: true,
        });
      }
    });
  }
});
