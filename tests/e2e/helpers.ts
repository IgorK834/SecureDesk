import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
export const E2E_DATABASE_PATH = path.resolve('data/securedesk.e2e.sqlite');
export const E2E_CREDENTIALS_PATH = path.resolve('tests/e2e/.credentials.json');

export interface E2eCredential {
  login: string;
  password: string;
}

export interface E2eCredentials {
  admin: E2eCredential;
  manager: E2eCredential;
  employee: E2eCredential;
  guest: E2eCredential;
}

export const EVIDENCE_DIR = path.resolve('docs/report-evidence');

export function credentials(): E2eCredentials {
  return JSON.parse(readFileSync(E2E_CREDENTIALS_PATH, 'utf8')) as E2eCredentials;
}

export function freshPassword(): string {
  return `Fresh-${randomBytes(18).toString('base64url')}!7`;
}

export async function submitLogin(page: Page, credential: E2eCredential): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Login').fill(credential.login);
  await page.getByLabel('Password').fill(credential.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function login(page: Page, credential: E2eCredential): Promise<void> {
  await submitLogin(page, credential);
  await page.waitForURL((url) => url.pathname !== '/login');
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

export async function createEmployee(
  page: Page,
  loginName: string,
): Promise<E2eCredential & { temporaryPassword: string }> {
  await page.goto('/admin/users/new');
  await page.getByLabel('Login').fill(loginName);
  await page.getByLabel('First name').fill('E2E');
  await page.getByLabel('Last name').fill('Employee');
  await page.getByLabel('Role').selectOption('EMPLOYEE');
  await page.getByRole('button', { name: 'Create account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Temporary password' });
  await expect(dialog).toBeVisible();
  const temporaryPassword = await dialog.getByLabel('Temporary password').inputValue();
  return { login: loginName, password: temporaryPassword, temporaryPassword };
}

export async function closeTemporaryPassword(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'I have saved the password' }).click();
  await expect(page.getByRole('dialog', { name: 'Temporary password' })).toBeHidden();
}
