import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE_PATH } from './helpers';

test('SEC-50/SEC-49: keyboard users skip the honeypot and a bot-filled value is trapped', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '198.51.100.240' });
  await page.goto('/login');

  const honeypot = page.locator('#website');
  await expect(honeypot).toHaveAttribute('name', 'website');
  await expect(honeypot).toHaveAttribute('tabindex', '-1');
  await expect(honeypot).toHaveAttribute('autocomplete', 'off');
  await expect(honeypot.locator('xpath=..')).toHaveAttribute('aria-hidden', 'true');
  expect(
    await honeypot.evaluate((element) => getComputedStyle(element.parentElement!).display),
  ).not.toBe('none');

  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Login')).toBeFocused();
  await expect(honeypot).not.toBeFocused();

  await honeypot.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = 'filled-by-bot';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByLabel('Login').fill('employee1');
  await page.getByLabel('Reversed characters').fill('TEST-SOLVED');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  const database = new Database(E2E_DATABASE_PATH, { readonly: true });
  try {
    expect(
      database
        .prepare(
          `SELECT kind, outcome, login_normalized
             FROM login_attempts
            WHERE ip_key = ?
            ORDER BY occurred_at DESC
            LIMIT 1`,
        )
        .get('198.51.100.240'),
    ).toEqual({ kind: 'HONEYPOT', outcome: 'FAILED', login_normalized: null });
    expect(
      database
        .prepare(
          `SELECT type, severity
             FROM security_events
            WHERE ip_key = ? AND type = 'HONEYPOT_TRIGGERED'`,
        )
        .get('198.51.100.240'),
    ).toEqual({ type: 'HONEYPOT_TRIGGERED', severity: 'WARNING' });
  } finally {
    database.close();
  }
});
