import { accessSync, appendFileSync, chmodSync, constants, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { SeedResult } from '.';

/**
 * Where `db:seed` leaves the generated initial passwords. Relative to the working directory
 * (apps/backend for every npm script, like the database path); `.local/` is git-ignored.
 */
export const INITIAL_CREDENTIALS_FILE = path.join('.local', 'initial-credentials.txt');

/**
 * Makes sure the passwords can be stored, before seeding creates anything: creates the private
 * directory, and checks that the file (or, while there is none yet, the directory) is writable.
 * Call it before seeding, so a problem aborts the run while no account exists whose password
 * could not be saved; otherwise the accounts would be committed with their passwords lost, and
 * the next run would only report "nothing to create".
 *
 * An existing file is also tightened to 0600 here, before any password is appended to it. It
 * checks writability first, so a file that was made read-only on purpose is reported, not
 * silently made writable.
 */
export function prepareCredentialsFile(file: string): void {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (existsSync(file)) {
    accessSync(file, constants.W_OK);
    chmodSync(file, 0o600);
  } else {
    accessSync(dir, constants.W_OK);
  }
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
