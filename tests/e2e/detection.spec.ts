import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  closeTemporaryPassword,
  createEmployee,
  credentials,
  E2E_DATABASE_PATH,
  login,
  submitLogin,
} from './helpers';
import { captureText } from './module3-evidence';

test('SEC-88 SEC-90 SEC-91 shows both alerts, links the audit range and restores the critical count on acknowledgement', async ({
  browser,
  page,
}, testInfo) => {
  test.skip(!process.env.SECUREDESK_E2E_DIR, 'Requires a disposable browser database.');
  await login(page, credentials().admin);
  const warningAccount = await createEmployee(page, 'e2e-detection-warning');
  await closeTemporaryPassword(page);
  const criticalAccount = await createEmployee(page, 'e2e-detection-critical');
  await closeTemporaryPassword(page);

  const baseline = await page.request.get('/api/admin/security-events', {
    params: { severity: 'CRITICAL', acknowledged: false, pageSize: 1 },
  });
  await expect(baseline).toBeOK();
  const { total: initialCriticalCount } = (await baseline.json()) as { total: number };
  const banner = page.getByRole('alert').filter({ hasText: 'unacknowledged critical' });
  const context = await browser.newContext();
  try {
    const signIn = await context.newPage();
    for (let i = 0; i < 5; i++) {
      await submitLogin(signIn, {
        login: warningAccount.login,
        password: 'Wrong fixture password!37',
      });
      await expect(signIn.getByRole('alert')).toContainText(
        i === 4 ? 'Too many failed attempts.' : 'Login lub hasło niepoprawne',
      );
    }
    for (let i = 0; i < 3; i++) {
      await submitLogin(signIn, {
        login: criticalAccount.login,
        password: 'Wrong fixture password!37',
      });
      await expect(signIn.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
    }
    await login(signIn, criticalAccount);

    const alertFile = path.join(path.dirname(E2E_DATABASE_PATH), 'alerts', 'security-alerts.jsonl');
    let alerts: { line: string; ruleId: string; subject: string | null; alertId: string }[] = [];
    await expect
      .poll(async () => {
        const text = await readFile(alertFile, 'utf8').catch(() => '');
        alerts = text
          .split('\n')
          .filter(Boolean)
          .map((line) => ({ ...JSON.parse(line), line }))
          .filter(
            ({ subject }) => subject === warningAccount.login || subject === criticalAccount.login,
          );
        return alerts.map(({ ruleId }) => ruleId).sort();
      })
      .toEqual(['FAILED_LOGIN_BURST', 'SUCCESS_AFTER_FAILURES']);
    const { alertId } = alerts.find(({ ruleId }) => ruleId === 'SUCCESS_AFTER_FAILURES')!;

    await page.getByRole('link', { name: 'Security events', exact: true }).click();
    await expect(banner.locator('strong')).toHaveText(
      `${initialCriticalCount + 1} unacknowledged critical security event(s).`,
    );
    const critical = page
      .getByRole('row')
      .filter({ hasText: 'Successful login after failed attempts' })
      .filter({ hasText: criticalAccount.login });
    await expect(critical).toContainText('CRITICAL');
    await expect(
      page
        .getByRole('row')
        .filter({ hasText: 'Burst of failed logins' })
        .filter({ hasText: warningAccount.login }),
    ).toContainText('WARNING');
    await page.screenshot({ path: testInfo.outputPath('detection-alerts.png') });
    await critical.getByRole('link', { name: 'View triggering audit entries' }).click();
    await expect(page).toHaveURL(/\/admin\/audit-log\?fromSeq=\d+&toSeq=\d+/);
    const panel = page.getByRole('region', { name: 'Detection rules' });
    await expect(panel).toContainText('5 failures in 5 minutes');
    await expect(panel).toContainText('3 failures in 10 minutes');
    await expect(panel.locator('time')).toHaveCount(2);
    await expect(page.getByText(/Alert entries #\d+–#\d+/)).toBeVisible();
    const results = page.getByRole('region', { name: 'Audit entry results' });
    await expect(results.getByRole('row').filter({ hasText: 'AUTH_LOGIN_FAILURE' })).toHaveCount(3);
    await expect(results.getByRole('row').filter({ hasText: 'AUTH_LOGIN_SUCCESS' })).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('detection-audit-range.png') });

    await page.getByRole('link', { name: 'Security events', exact: true }).click();
    await critical.getByRole('button', { name: 'Acknowledge' }).click();
    await expect(critical).toContainText('Acknowledged');
    if (initialCriticalCount === 0) await expect(banner).toBeHidden();
    else
      await expect(banner.locator('strong')).toHaveText(
        `${initialCriticalCount} unacknowledged critical security event(s).`,
      );

    await page.getByRole('link', { name: 'Audit log', exact: true }).click();
    await page.getByLabel('User', { exact: true }).fill(criticalAccount.login);
    await page.getByLabel('Action', { exact: true }).selectOption('ALERT_RAISED');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    const auditRow = page
      .getByRole('row')
      .filter({ hasText: 'ALERT_RAISED' })
      .filter({ has: page.getByRole('cell', { name: criticalAccount.login, exact: true }) });
    await expect(auditRow).toHaveCount(1);
    await auditRow.getByRole('button', { name: /View entry/ }).click();
    const detail = page.getByRole('dialog', { name: /Audit entry/ });
    await expect(detail).toContainText(alertId);
    await detail.screenshot({ path: testInfo.outputPath('m3-05-alert-in-log.png') });
    await captureText(
      browser,
      'security-alerts.jsonl · two delivered alerts',
      alerts.map(({ line }) => line).join('\n'),
      testInfo.outputPath('m3-06-alert-file.png'),
    );
    await detail.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await page.getByRole('link', { name: criticalAccount.login, exact: true }).click();
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Reset this password?' })
      .getByRole('button', { name: 'Reset password' })
      .click();
    await closeTemporaryPassword(page);
    await page.getByRole('button', { name: 'Block', exact: true }).click();
    await page.getByRole('button', { name: 'Block account' }).click();
    await expect(page.getByText('Account blocked. Its sessions were ended.')).toBeVisible();
    await page.getByRole('link', { name: 'Audit log', exact: true }).click();
    const accountAuditRows = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: criticalAccount.login, exact: true }),
    });
    for (const action of ['PASSWORD_RESET_BY_ADMIN', 'USER_BLOCKED']) {
      await expect(accountAuditRows.filter({ hasText: action })).toBeVisible();
    }
  } finally {
    await context.close();
  }
});
