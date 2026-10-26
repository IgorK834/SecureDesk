import path from 'node:path';
import { expect, test } from '@playwright/test';
import { credentials, EVIDENCE_DIR, login } from './helpers';

test('@slow SEC-22: the next action after one idle minute ends the session', async ({ page }) => {
  test.setTimeout(100_000);
  await login(page, credentials().admin);
  await page.goto('/admin/security');
  await page.getByLabel('Idle timeout (minutes)').fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  await page.waitForTimeout(65_000);
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?reason=session-expired$/);
  await expect(page.getByText('Your session has expired due to inactivity.')).toBeVisible();
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '07-idle-logout.png'), fullPage: true });

  await login(page, credentials().admin);
  await page.goto('/admin/security');
  await page.getByLabel('Idle timeout (minutes)').fill('15');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});
