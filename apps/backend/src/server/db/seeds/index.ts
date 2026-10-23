import type { AppDb } from '../connection';
import { seedRbac } from './rbac';
import { seedSecuritySettings } from './security-settings';
import { seedTickets } from './tickets';
import { SEED_USERS, insertUsers, prepareNewUsers } from './users';

export interface SeedOptions {
  /**
   * Also add the demo tickets (`seeds/tickets.ts`). Off by default: they are for development and
   * test databases, so the CLI turns them on only when NODE_ENV is not `production`.
   */
  demoTickets?: boolean;
}

export interface SeedResult {
  /**
   * Accounts this run created, with the plaintext of their generated initial password. This is
   * the only place the plaintext exists: never log it and never serialize this object. The CLI
   * hands it to the 0600 credentials file; tests read it straight from the return value.
   */
  created: { login: string; password: string }[];
  /** Seed logins that were already in the database and were left untouched. */
  skipped: string[];
  /** Demo tickets this run created; 0 when they were not requested or already exist. */
  ticketsCreated: number;
}

/**
 * Idempotent seed: four roles, the permission matrix, the settings row, ADMIN and six test
 * users, plus the demo tickets when asked. It adds what is missing and makes the role/permission
 * links equal the matrix. An existing account (matched by normalized login) is skipped and its
 * stored hash is never read or changed, so re-running cannot overwrite a real credential; an
 * existing demo ticket is likewise left as it is. All writes happen in one transaction: either
 * everything is seeded or nothing is.
 *
 * The database must already be migrated.
 */
export async function seedDatabase(
  db: AppDb,
  { demoTickets = false }: SeedOptions = {},
): Promise<SeedResult> {
  const prepared = await prepareNewUsers(db);

  const { createdUsers, ticketsCreated } = db.transaction((tx) => {
    seedRbac(tx);
    seedSecuritySettings(tx);
    const createdUsers = insertUsers(tx, prepared);
    return { createdUsers, ticketsCreated: demoTickets ? seedTickets(tx) : 0 };
  });

  const createdLogins = new Set(createdUsers.map(({ user }) => user.login));
  return {
    created: createdUsers.map(({ user, password }) => ({ login: user.login, password })),
    skipped: SEED_USERS.filter((user) => !createdLogins.has(user.login)).map((user) => user.login),
    ticketsCreated,
  };
}
