import path from 'node:path';
import { expect, test } from '@playwright/test';
import { MODULE_2_EVIDENCE_DIR } from './helpers';

test('SEC-40/SEC-48: the browser solves a fresh internal login CAPTCHA without external network', async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': '198.51.100.201' });
  await page.goto('/login');

  const image = page.getByRole('img', { name: 'CAPTCHA challenge' });
  await expect(image).toBeVisible();
  await expect(page.getByText('Type the characters in reverse order.')).toBeVisible();
  await page.getByLabel('Login').fill('fake-only-captcha-evidence');
  await page.getByLabel('Reversed characters').fill('TEST-SOLVED');
  await page.getByLabel('Password').fill('FAKE-ONLY-WRONG-PASSWORD!');
  const firstImage = await image.getAttribute('src');

  await page.screenshot({
    path: path.join(MODULE_2_EVIDENCE_DIR, 'm2-02-login-captcha.png'),
    fullPage: true,
    mask: [page.getByLabel('Reversed characters'), page.getByLabel('Password')],
  });

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  await expect(image).not.toHaveAttribute('src', firstImage ?? '');
});
