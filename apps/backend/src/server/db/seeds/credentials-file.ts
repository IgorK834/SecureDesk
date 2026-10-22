import { appendFileSync, chmodSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { SeedResult } from '.';

/**
 * Where `db:seed` leaves the generated initial passwords. Relative to the working directory
 * (apps/backend for every npm script, like the database path); `.local/` is git-ignored.
 */
export const INITIAL_CREDENTIALS_FILE = path.join('.local', 'initial-credentials.txt');

/**
 * Creates the private directory. Call it before seeding, so a permission problem aborts the
 * run before any account exists whose password could not be saved.
 */
export function prepareCredentialsDir(file: string): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
}

/**
 * Appends the passwords of newly created accounts, readable by the owner only (0600). It
 * appends instead of overwriting so that passwords of accounts created by an earlier run and
 * not changed yet are not lost.
 */
export function appendInitialCredentials(
  file: string,
  created: SeedResult['created'],
  issuedAt: Date,
): void {
  const lines = [
    `# Issued ${issuedAt.toISOString()} by db:seed. Change each password at first login, then delete this file.`,
    '# Test users: valid for 12 hours from creation. ADMIN: does not expire until it is changed.',
    ...created.map(({ login, password }) => `${login}: ${password}`),
    '',
  ];
  appendFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
  // `mode` above only applies when the file is created; also tighten a pre-existing file.
  chmodSync(file, 0o600);
}
