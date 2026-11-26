import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { credentials, login } from './helpers';

test('SEC-79 and SEC-80 an administrator browses, filters and downloads audit entries', async ({
  page,
}, testInfo) => {
  await login(page, credentials().admin);
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log$/);
  await expect(page.getByRole('columnheader', { name: 'Time (UTC)' })).toBeVisible();

  await page.getByLabel('User', { exact: true }).fill('ADMIN');
  await page.getByLabel('Action', { exact: true }).selectOption('AUTH_LOGIN_SUCCESS');
  const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 16);
  await page.getByLabel('From (UTC)').fill(from);
  await page.getByRole('button', { name: 'Apply filters' }).click();

  const row = page.getByRole('row').filter({ hasText: 'AUTH_LOGIN_SUCCESS' });
  await expect(row).toHaveCount(1);
  await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
  await expect(row).toContainText('ADMIN');
  const utc = await row.locator('time').getAttribute('datetime');
  expect(utc).toMatch(/Z$/);
  await expect(row.locator('time')).toHaveText(utc!.slice(0, -1).replace('T', ' '));
  await page.screenshot({ path: testInfo.outputPath('audit-log.png') });

  await row.getByRole('button', { name: /View entry/ }).click();
  const drawer = page.getByRole('dialog', { name: /Audit entry/ });
  await expect(drawer).toBeVisible();
  await expect(drawer).toContainText('Previous hash');
  await expect(drawer).toContainText('Entry hash');
  await expect(drawer).toContainText(/[a-f0-9]{64}/);
  await drawer.getByRole('button', { name: 'Close' }).click();

  for (const [button, extension] of [
    ['Export CSV', 'csv'],
    ['Export JSON Lines', 'jsonl'],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: button, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp('^audit-log-.*\\.' + extension + '$'));
    const content = await readFile(await download.path(), 'utf8');
    expect(content).toContain('AUTH_LOGIN_SUCCESS');
    expect(content).toContain('prev_hash');
    expect(content).toContain('entry_hash');
    expect(content).not.toContain('AUDIT_LOG_VIEWED');
  }
});

test('a Guest has no audit navigation and is refused the browser route', async ({ page }) => {
  await login(page, credentials().guest);
  await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  await page.goto('/admin/audit-log');
  await expect(page).toHaveURL(/\/forbidden$/);
});
