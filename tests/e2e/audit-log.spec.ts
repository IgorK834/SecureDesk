import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { closeTemporaryPassword, createEmployee, credentials, login, submitLogin } from './helpers';
import {
  auditTableFragment,
  captureAuditRows,
  captureText,
  disposableDatabase,
} from './module3-evidence';

test('SEC-79 SEC-80 generates, filters and downloads authentication and administration audit entries', async ({
  page,
  browser,
}, testInfo) => {
  test.skip(!process.env.SECUREDESK_E2E_DIR, 'Requires a disposable browser database.');
  disposableDatabase();
  const identities = credentials();
  await login(page, identities.admin);
  const actor = await browser.newPage();
  try {
    for (const loginName of [identities.employee.login, 'backup_admin']) {
      await submitLogin(actor, { login: loginName, password: 'Wrong browser fixture password!37' });
      await expect(actor.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
    }
  } finally {
    await actor.close();
  }
  await createEmployee(page, 'audit.evidence');
  await closeTemporaryPassword(page);
  await page.goto('/admin/security');
  await page.getByLabel('Idle timeout (minutes)').fill('16');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page).toHaveURL(/\/admin\/audit-log$/);
  await expect(page.getByRole('columnheader', { name: 'Time (UTC)' })).toBeVisible();
  const results = page.getByRole('region', { name: 'Audit entry results' });
  await expect(results.getByRole('row').filter({ hasText: 'USER_CREATED' })).toContainText(
    'audit.evidence',
  );
  await expect(results.getByRole('row').filter({ hasText: 'SETTINGS_CHANGED' })).toBeVisible();

  const action = page.getByLabel('Action', { exact: true });
  const user = page.getByLabel('User', { exact: true });
  const apply = page.getByRole('button', { name: 'Apply filters' });
  await user.fill(identities.employee.login);
  await action.selectOption('AUTH_LOGIN_FAILURE');
  await page
    .getByLabel('From (UTC)')
    .fill(new Date(Date.now() - 86_400_000).toISOString().slice(0, 16));
  await apply.click();
  const rows = results.locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('AUTH_LOGIN_FAILURE');
  await expect(rows.first()).toContainText(identities.employee.login);
  const utc = await rows.first().locator('time').getAttribute('datetime');
  expect(utc).toMatch(/Z$/);
  await expect(rows.first().locator('time')).toHaveText(utc!.slice(0, -1).replace('T', ' '));
  await captureAuditRows(page, testInfo.outputPath('m3-01-log-browser-filter.png'));
  await captureText(
    browser,
    'SQLite audit log · latest entries',
    auditTableFragment(),
    testInfo.outputPath('m3-02-audit-table-fragment.png'),
  );

  await rows
    .first()
    .getByRole('button', { name: /View entry/ })
    .click();
  const drawer = page.getByRole('dialog', { name: /Audit entry/ });
  await expect(drawer).toContainText('Previous hash');
  await expect(drawer).toContainText('Entry hash');
  await expect(drawer).toContainText(/[a-f0-9]{64}/);
  await drawer.getByRole('button', { name: 'Close' }).click();

  for (const [name, extension] of [
    ['Export CSV', 'csv'],
    ['Export JSON Lines', 'jsonl'],
  ] as const) {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name, exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp('^audit-log-.*\\.' + extension + '$'));
    const content = await readFile(await download.path(), 'utf8');
    expect(content).toContain('AUTH_LOGIN_FAILURE');
    expect(content).toContain('prev_hash');
    expect(content).toContain('entry_hash');
    expect(content).not.toContain('AUDIT_LOG_VIEWED');
    expect(content).not.toContain('Wrong browser fixture');
    if (extension === 'csv') {
      await captureText(
        browser,
        'Exported audit-log CSV',
        content.trimEnd(),
        testInfo.outputPath('m3-07-exported-file.png'),
      );
    } else {
      const sample = JSON.parse(content.trimEnd().split('\n')[0]!);
      await writeFile(
        testInfo.outputPath('m3-sample-entry.json'),
        JSON.stringify(sample, null, 2) + '\n',
      );
    }
  }

  await user.fill('');
  await action.selectOption('AUDIT_LOG_EXPORTED');
  await apply.click();
  await expect(rows).toHaveCount(2);
  await rows
    .first()
    .getByRole('button', { name: /View entry/ })
    .click();
  await expect(drawer).toContainText(/"rowCount":\s*1/);
  await expect(drawer).toContainText(identities.employee.login);
  await drawer.getByRole('button', { name: 'Close' }).click();

  await action.selectOption('AUTH_TRAP_ACCOUNT_USED');
  await apply.click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('AUTH_TRAP_ACCOUNT_USED');
  await expect(rows.first()).toContainText('backup_admin');
  await captureAuditRows(page, testInfo.outputPath('m3-08-trap-account-entry.png'));
  await page.getByRole('link', { name: 'Security events', exact: true }).click();
  const trap = page.getByRole('row').filter({ hasText: 'HONEYTOKEN_TRIGGERED' });
  await trap.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(trap).toContainText('Acknowledged');
});

test('a Guest has no audit navigation and is refused the browser route', async ({ page }) => {
  await login(page, credentials().guest);
  await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
  await page.goto('/admin/audit-log');
  await expect(page).toHaveURL(/\/forbidden$/);
});
