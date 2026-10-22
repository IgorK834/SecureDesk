import type { AppDb } from '../connection';
import { seedRbac } from './rbac';
import { seedSecuritySettings } from './security-settings';
import { SEED_USERS, insertUsers, prepareNewUsers } from './users';

export interface SeedResult {
  /**
   * Accounts this run created, with the plaintext of their generated initial password. This is
   * the only place the plaintext exists: never log it and never serialize this object. The CLI
   * hands it to the 0600 credentials file; tests read it straight from the return value.
   */
  created: { login: string; password: string }[];
  /** Seed logins that were already in the database and were left untouched. */
  skipped: string[];
}

/**
 * Idempotent seed: four roles, the permission matrix, the settings row, ADMIN and six test
 * users. It only adds what is missing. An existing account (matched by normalized login) is
 * skipped and its stored hash is never read or changed, so re-running cannot overwrite a real
 * credential. All writes happen in one transaction: either everything is seeded or nothing is.
 *
 * The database must already be migrated.
 */
export async function seedDatabase(db: AppDb): Promise<SeedResult> {
  const prepared = await prepareNewUsers(db);

  const createdUsers = db.transaction((tx) => {
    seedRbac(tx);
    seedSecuritySettings(tx);
    return insertUsers(tx, prepared);
  });

  const createdLogins = new Set(createdUsers.map(({ user }) => user.login));
  return {
    created: createdUsers.map(({ user, password }) => ({ login: user.login, password })),
    skipped: SEED_USERS.filter((user) => !createdLogins.has(user.login)).map((user) => user.login),
  };
}
