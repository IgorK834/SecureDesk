import { eq } from 'drizzle-orm';
import { issueTemporaryCredential } from '../auth/temporary-password';
import type { AppDb } from '../db/connection';
import { ConflictError as DbConflictError, mapDbError } from '../db/errors';
import { users } from '../db/schema';
import { ApiError } from '../http/errors';
import { clock } from '../time/clock';
import { assertNotProtectedAccount, findLiveAccount, protectedAccount } from './account-service';
import { normalizeLogin } from './login';
import { type AdminUserDto, toAdminUserDto } from './mappers';
import { roleIdOf, type CreateUserInput, type UpdateUserInput } from './schemas';
import { ADMIN_USER_COLUMNS, getUser } from './user-queries';

export interface CreatedUser {
  user: AdminUserDto;
  /** Shown to the administrator once, in the creation response; only its hash is stored. */
  temporaryPassword: { value: string; expiresAt: Date };
}

/**
 * Creates an account with the chosen role and a temporary password that must be replaced at first
 * login (12 hours, 16 characters). A login that exists in any spelling is a 409.
 *
 * The password is hashed first, because hashing is asynchronous and a better-sqlite3 transaction
 * is not; the row is then written with everything in one INSERT, which is atomic by itself, so
 * there is never an account without its credential (the same order the seed uses).
 */
export async function createUser(db: AppDb, input: CreateUserInput): Promise<CreatedUser> {
  const credential = await issueTemporaryCredential(clock);
  const now = clock.now();

  try {
    const row = db
      .insert(users)
      .values({
        login: input.login,
        loginNormalized: normalizeLogin(input.login),
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: roleIdOf(input.role),
        passwordHash: credential.hash,
        mustChangePassword: true,
        temporaryPasswordExpiresAt: credential.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning(ADMIN_USER_COLUMNS)
      .get();

    return {
      user: toAdminUserDto(row),
      temporaryPassword: { value: credential.plaintext, expiresAt: credential.expiresAt },
    };
  } catch (error) {
    if (mapDbError(error) instanceof DbConflictError) {
      throw new ApiError(409, 'LOGIN_ALREADY_EXISTS', 'Konto o takim loginie już istnieje');
    }
    throw error;
  }
}

/**
 * Changes the name and/or role, and nothing else: the update names its columns, so the password
 * hash, history, sessions and every other field stay as they were. The Administrator role cannot
 * be handed out, and the permanent ADMIN account's role cannot be changed (409 either way).
 */
export function updateUser(db: AppDb, id: string, changes: UpdateUserInput): AdminUserDto {
  return db.transaction(
    (tx) => {
      const account = findLiveAccount(tx, id);

      if (changes.role !== undefined) {
        if (changes.role === 'ADMINISTRATOR') throw protectedAccount();
        assertNotProtectedAccount(account);
      }

      tx.update(users)
        .set({
          ...(changes.firstName !== undefined && { firstName: changes.firstName }),
          ...(changes.lastName !== undefined && { lastName: changes.lastName }),
          ...(changes.role !== undefined && { roleId: roleIdOf(changes.role) }),
        })
        .where(eq(users.id, id))
        .run();
      return getUser(tx, id);
    },
    { behavior: 'immediate' },
  );
}
