import { eq } from 'drizzle-orm';
import { systemAudit, type AuditContext } from '../audit/context';
import { issueTemporaryCredential } from '../auth/temporary-password';
import type { AppDb } from '../db/connection';
import { ConflictError as DbConflictError, mapDbError } from '../db/errors';
import { honeytokens, users } from '../db/schema';
import { ApiError, ValidationError } from '../http/errors';
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
 * is not. The account, its credential and its audit entry commit together.
 */
export async function createUser(
  db: AppDb,
  input: CreateUserInput,
  audit: AuditContext,
): Promise<CreatedUser> {
  const normalizedLogin = normalizeLogin(input.login);
  const reserved = db
    .select({ id: honeytokens.id })
    .from(honeytokens)
    .where(eq(honeytokens.loginNormalized, normalizedLogin))
    .get();
  if (reserved) throw new ValidationError({ field: 'login', reason: 'RESERVED_LOGIN' });

  const credential = await issueTemporaryCredential(clock);
  const now = clock.now();

  try {
    return db.transaction(
      (tx) => {
        const row = tx
          .insert(users)
          .values({
            login: input.login,
            loginNormalized: normalizedLogin,
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

        audit.record(tx, {
          action: 'USER_CREATED',
          outcome: 'SUCCESS',
          details: { userId: row.id },
          subject: { subjectLogin: normalizedLogin },
        });

        return {
          user: toAdminUserDto(row),
          temporaryPassword: { value: credential.plaintext, expiresAt: credential.expiresAt },
        };
      },
      { behavior: 'immediate' },
    );
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
export function updateUser(
  db: AppDb,
  id: string,
  changes: UpdateUserInput,
  audit: AuditContext = systemAudit(),
): AdminUserDto {
  return db.transaction(
    (tx) => {
      const account = findLiveAccount(tx, id);

      if (changes.role !== undefined) {
        if (changes.role === 'ADMINISTRATOR') throw protectedAccount();
        assertNotProtectedAccount(account);
      }
      const roleId = changes.role === undefined ? undefined : roleIdOf(changes.role);

      tx.update(users)
        .set({
          ...(changes.firstName !== undefined && { firstName: changes.firstName }),
          ...(changes.lastName !== undefined && { lastName: changes.lastName }),
          ...(roleId !== undefined && { roleId }),
        })
        .where(eq(users.id, id))
        .run();
      const subject = { subjectLogin: account.loginNormalized };
      const changedFields = (['firstName', 'lastName'] as const).filter(
        (field) => changes[field] !== undefined && changes[field] !== account[field],
      );
      const roleChanged = roleId !== undefined && roleId !== account.roleId;
      // A no-op PATCH still writes updated_at. Record it with an empty field list.
      if (changedFields.length || !roleChanged) {
        audit.record(tx, {
          action: 'USER_UPDATED',
          outcome: 'SUCCESS',
          details: { changedFields },
          subject,
        });
      }
      if (roleChanged) {
        audit.record(tx, {
          action: 'USER_ROLE_CHANGED',
          outcome: 'SUCCESS',
          details: { from: account.roleId, to: roleId },
          subject,
        });
      }
      return getUser(tx, id);
    },
    { behavior: 'immediate' },
  );
}
