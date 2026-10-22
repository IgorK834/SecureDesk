import { hashPassword } from '../../auth/password-hasher';
import {
  TEMPORARY_PASSWORD_TTL_MS,
  generateTemporaryPassword,
} from '../../auth/temporary-password';
import { ROLES, type RoleId } from '../../permissions/codes';
import { clock } from '../../time/clock';
import { normalizeLogin } from '../../users/login';
import type { AppDb, AppTransaction } from '../connection';
import { users } from '../schema';

export const ADMIN_LOGIN = 'ADMIN';

interface SeedUser {
  login: string;
  firstName: string;
  lastName: string;
  roleId: RoleId;
}

/**
 * The accounts the seed creates. Logins are fixed so tests and reviewers can rely on them;
 * passwords are not part of this list and never will be. The names are distinct and realistic
 * because the personal-data password rule is tested against them later.
 */
export const SEED_USERS: readonly SeedUser[] = [
  {
    login: ADMIN_LOGIN,
    firstName: 'System',
    lastName: 'Administrator',
    roleId: ROLES.ADMINISTRATOR,
  },
  { login: 'manager1', firstName: 'Anna', lastName: 'Kowalska', roleId: ROLES.MANAGER },
  { login: 'manager2', firstName: 'Piotr', lastName: 'Nowak', roleId: ROLES.MANAGER },
  { login: 'employee1', firstName: 'Katarzyna', lastName: 'Wiśniewska', roleId: ROLES.EMPLOYEE },
  { login: 'employee2', firstName: 'Marek', lastName: 'Zieliński', roleId: ROLES.EMPLOYEE },
  { login: 'guest1', firstName: 'Ewa', lastName: 'Lewandowska', roleId: ROLES.GUEST },
  { login: 'guest2', firstName: 'Tomasz', lastName: 'Kamiński', roleId: ROLES.GUEST },
];

export interface PreparedUser {
  user: SeedUser;
  /** Plaintext initial password. Exists only in memory; the database gets `passwordHash`. */
  password: string;
  passwordHash: string;
}

/**
 * Generates an initial password and its Argon2id hash for every seed account that is not in
 * the database yet. Accounts that exist get nothing generated, so their credentials cannot be
 * touched. This is separate from the insert because hashing is asynchronous while a
 * better-sqlite3 transaction is synchronous.
 */
export async function prepareNewUsers(db: AppDb): Promise<PreparedUser[]> {
  const existing = new Set(
    db
      .select({ loginNormalized: users.loginNormalized })
      .from(users)
      .all()
      .map((row) => row.loginNormalized),
  );

  const prepared: PreparedUser[] = [];
  // One at a time: each hash needs 19 MiB, so this keeps peak memory flat.
  for (const user of SEED_USERS.filter((u) => !existing.has(normalizeLogin(u.login)))) {
    const password = generateTemporaryPassword();
    prepared.push({ user, password, passwordHash: await hashPassword(password) });
  }
  return prepared;
}

/**
 * Inserts the prepared accounts and returns those that were actually created. An account that
 * appeared since `prepareNewUsers` (a concurrent seed) conflicts on `login_normalized`, is
 * skipped, and is therefore not reported, so no password is ever reported for a row we did not
 * write.
 *
 * Every account must change its password at first login. The six test users get the standard
 * 12-hour temporary-password lifetime. ADMIN's expiry stays NULL: no other administrator can
 * reset it, so letting it lapse would lock the system out (see docs/database-schema.md).
 */
export function insertUsers(tx: AppTransaction, prepared: PreparedUser[]): PreparedUser[] {
  const now = clock.now();
  const created: PreparedUser[] = [];

  for (const entry of prepared) {
    const { user, passwordHash } = entry;
    const inserted = tx
      .insert(users)
      .values({
        login: user.login,
        loginNormalized: normalizeLogin(user.login),
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        passwordHash,
        mustChangePassword: true,
        temporaryPasswordExpiresAt:
          user.login === ADMIN_LOGIN ? null : new Date(now.getTime() + TEMPORARY_PASSWORD_TTL_MS),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: users.id })
      .all();

    if (inserted.length > 0) created.push(entry);
  }
  return created;
}
