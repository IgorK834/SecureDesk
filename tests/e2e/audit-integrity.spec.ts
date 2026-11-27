import { expect, test } from '@playwright/test';
import { credentials, login } from './helpers';
import { withChangedFixtureRow } from './module3-evidence';

test('SEC-96 verifies integrity, identifies the modified entry, and restores the fixture', async ({
  page,
}, testInfo) => {
  test.skip(!process.env.SECUREDESK_E2E_DIR, 'Requires a disposable browser database.');
  await login(page, credentials().admin);
  await page.getByRole('link', { name: 'Audit log' }).click();
  const panel = page.getByRole('region', { name: 'Integrity', exact: true });
  const status = panel.getByRole('status');
  const button = panel.getByRole('button', { name: 'Verify integrity' });

  async function verify() {
    await button.focus();
    const [response] = await Promise.all([
      page.waitForResponse(
        (result) =>
          new URL(result.url()).pathname === '/api/admin/audit-log/verify' &&
          result.request().method() === 'POST',
      ),
      button.press('Enter'),
    ]);
    expect(response.ok()).toBe(true);
  }

  await expect(status).toHaveAttribute('aria-live', 'polite');
  await expect(status).toContainText('Log intact');
  await verify();
  await expect(status).toContainText(/[1-9]\d* entr(?:y|ies) checked/);
  await expect(status).toContainText(/Last verified at.*UTC/s);
  await panel.screenshot({ path: testInfo.outputPath('m3-03-integrity-intact.png') });

  await withChangedFixtureRow(async (row) => {
    await verify();
    await expect(status).toContainText('Tampering detected');
    await expect(status).toContainText('HASH_MISMATCH');
    await expect(status).toContainText('Sequence #' + row.seq);
    await expect(status).toContainText(row.id);
    await panel.screenshot({ path: testInfo.outputPath('m3-04-integrity-tampered.png') });
    const link = status.getByRole('link', { name: 'Filter to entry #' + row.seq });
    await link.focus();
    await link.press('Enter');
    const results = page.getByRole('region', { name: 'Audit entry results' });
    await expect(results).toBeFocused();
    await expect(results.locator('tbody tr')).toHaveCount(1);
    await expect(
      results.getByRole('row').filter({ hasText: 'Changed browser fixture' }),
    ).toBeVisible();
    await page.reload();
    await expect(status).toContainText('Tampering detected');
  });

  await verify();
  await expect(status).toContainText('Log intact');
});
