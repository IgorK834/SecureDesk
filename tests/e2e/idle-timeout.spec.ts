import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { credentials, E2E_DATABASE_PATH, EVIDENCE_DIR, login } from './helpers';

function backdateLiveSessions(milliseconds: number): void {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database
      .prepare('UPDATE sessions SET last_activity_at = ? WHERE revoked_at IS NULL')
      .run(Date.now() - milliseconds);
  } finally {
    database.close();
  }
}

test('SEC-22: the next action after one idle minute ends the session', async ({ page }) => {
  await login(page, credentials().admin);
  await page.goto('/admin/security');
  await page.getByLabel('Idle timeout (minutes)').fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();

  backdateLiveSessions(65_000);
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
