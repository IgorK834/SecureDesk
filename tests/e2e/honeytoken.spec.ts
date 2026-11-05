import Database from 'better-sqlite3';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  E2E_DATABASE_PATH,
  MODULE_2_EVIDENCE_DIR,
  credentials,
  login,
  submitLogin,
} from './helpers';

function clearHoneytokenEvidence(): void {
  const database = new Database(E2E_DATABASE_PATH);
  try {
    database.transaction(() => {
      database.prepare('DELETE FROM security_events').run();
      database.prepare('DELETE FROM login_attempts').run();
      database.prepare('UPDATE honeytokens SET last_triggered_at = NULL, trigger_count = 0').run();
    })();
  } finally {
    database.close();
  }
}

async function addHermeticNote(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('#hermetic-evidence-note')?.remove();
    const note = document.createElement('aside');
    note.id = 'hermetic-evidence-note';
    note.style.cssText =
      'padding:14px;margin:12px 0;border:2px solid #855600;background:#fff7dd;font:16px system-ui';
    note.textContent =
      'Hermetic E2E evidence: the real local CRITICAL event is shown below. Hosted Canarytokens delivery is disabled in CI; replace this image with the redacted hosted notification during the manual live pass.';
    document.querySelector('main')?.prepend(note);
  });
}

test('SEC-51/SEC-53: account and AWS-decoy honeytokens create visible critical events', async ({
  browser,
  page,
}) => {
  clearHoneytokenEvidence();

  const trapContext = await browser.newContext();
  const trapPage = await trapContext.newPage();
  await submitLogin(trapPage, {
    login: 'backup_admin',
    password: 'FAKE-ONLY-TRAP-PROBE!',
  });
  await expect(trapPage.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  await trapContext.close();

  const decoy = await page.request.get('/api/backup/config', {
    headers: { 'X-Forwarded-For': '198.51.100.206' },
  });
  expect(decoy.status()).toBe(200);

  await login(page, credentials().admin);
  await page.goto('/admin/security-events');
  await expect(
    page.locator('tbody strong').filter({ hasText: /^HONEYTOKEN_TRIGGERED$/ }),
  ).toBeVisible();
  await expect(
    page.locator('tbody strong').filter({ hasText: /^DECOY_RESOURCE_ACCESSED$/ }),
  ).toBeVisible();

  const type = page.locator('select[name="type"]');
  await type.selectOption('HONEYTOKEN_TRIGGERED');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('type=HONEYTOKEN_TRIGGERED')),
    page.getByRole('button', { name: 'Apply filters' }).click(),
  ]);
  await expect(page.locator('tbody strong')).toHaveText(['HONEYTOKEN_TRIGGERED']);
  await addHermeticNote(page);
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-05-canarytoken-account-trap-alert.png'),
    fullPage: true,
  });

  await type.selectOption('DECOY_RESOURCE_ACCESSED');
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('type=DECOY_RESOURCE_ACCESSED')),
    page.getByRole('button', { name: 'Apply filters' }).click(),
  ]);
  await expect(page.locator('tbody strong')).toHaveText(['DECOY_RESOURCE_ACCESSED']);
  await addHermeticNote(page);
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-06-canarytoken-aws-alert.png'),
    fullPage: true,
  });

  await type.selectOption('');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(
    page.locator('tbody strong').filter({ hasText: /^HONEYTOKEN_TRIGGERED$/ }),
  ).toBeVisible();
  await page.evaluate(() => document.querySelector('#hermetic-evidence-note')?.remove());
  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-08-security-events.png'),
    fullPage: true,
  });
});
