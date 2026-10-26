import { expect, test } from '@playwright/test';
import { credentials, login } from './helpers';

test('SEC-26: ticket markup is rendered as literal text and executes nothing', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __xssTriggered: boolean }).__xssTriggered = false;
    window.alert = () => {
      (window as unknown as { __xssTriggered: boolean }).__xssTriggered = true;
    };
  });
  await login(page, credentials().guest);
  await page.goto('/tickets/new');
  const attack = '<img src=x onerror=alert(1)>';
  await page.getByLabel('Title').fill(attack);
  await page.getByLabel('Description').fill('Plain-text XSS regression test.');
  await page.getByRole('button', { name: 'Create ticket' }).click();

  await expect(page.getByText(attack, { exact: true })).toBeVisible();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
  expect(
    await page.evaluate(() => (window as unknown as { __xssTriggered: boolean }).__xssTriggered),
  ).toBe(false);
});
