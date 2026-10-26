import { expect, test } from '@playwright/test';
import { closeTemporaryPassword, createEmployee, credentials, login, submitLogin } from './helpers';

test('administrator creates, blocks, unblocks, resets and deletes a user', async ({
  browser,
  page,
}) => {
  await login(page, credentials().admin);
  const created = await createEmployee(page, 'e2e-admin-flow');
  await closeTemporaryPassword(page);
  await expect(page.getByRole('heading', { name: 'E2E Employee' })).toBeVisible();

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await login(userPage, created);
  await expect(userPage).toHaveURL(/\/change-initial-password$/);

  await page.getByRole('button', { name: 'Block', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Block this account?' })).toBeVisible();
  await page.getByRole('button', { name: 'Block account' }).click();
  await expect(page.getByText('Account blocked. Its sessions were ended.')).toBeVisible();

  await userPage.goto('/dashboard');
  await expect(userPage).toHaveURL(/\/login/);
  await submitLogin(userPage, created);
  await expect(userPage.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');

  await page.getByRole('button', { name: 'Unblock' }).click();
  await page.getByRole('button', { name: 'Unblock account' }).click();
  await expect(page.getByText('Account unblocked.')).toBeVisible();
  await submitLogin(userPage, created);
  await expect(userPage).toHaveURL(/\/change-initial-password$/);

  await page.getByRole('button', { name: 'Reset password' }).click();
  await page
    .getByRole('dialog', { name: 'Reset this password?' })
    .getByRole('button', { name: 'Reset password' })
    .click();
  const passwordDialog = page.getByRole('dialog', { name: 'Temporary password' });
  const replacement = await passwordDialog.getByLabel('Temporary password').inputValue();
  await closeTemporaryPassword(page);

  await userPage.goto('/dashboard');
  await expect(userPage).toHaveURL(/\/login/);
  await submitLogin(userPage, created);
  await expect(userPage.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  await login(userPage, { login: created.login, password: replacement });
  await expect(userPage).toHaveURL(/\/change-initial-password$/);

  await page.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete this account?' })
    .getByRole('button', { name: 'Delete account' })
    .click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await userPage.goto('/login');
  await submitLogin(userPage, { login: created.login, password: replacement });
  await expect(userPage.getByRole('alert')).toHaveText('Login lub hasło niepoprawne');
  await userContext.close();
});
