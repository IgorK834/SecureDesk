import { and, eq, isNull } from 'drizzle-orm';
import { rememberPasswordHash } from '../auth/password-service';
import { revokeAllForUser } from '../auth/session-service';
import { applyTemporaryCredential, issueTemporaryCredential } from '../auth/temporary-password';
import type { AppDb, AppTransaction } from '../db/connection';
import { ADMIN_LOGIN } from '../db/seeds/users';
import { users } from '../db/schema';
import { ApiError, NotFoundError } from '../http/errors';
import { clock } from '../time/clock';
import { normalizeLogin } from './login';
import type { AdminUserDto } from './mappers';
import { getUser } from './user-queries';

// Taking an account out of use: blocking, unblocking and (soft) deleting. Each runs in one
// transaction, so an account is never blocked while its sessions live on, and each is idempotent:
// repeating a call ends in the same state and is not an error.

/** The account the system cannot be run without: no other administrator can recover it. */
const PROTECTED_LOGIN = normalizeLogin(ADMIN_LOGIN);

/** 409: the permanent ADMIN account may not be blocked, deleted, re-roled or given the role by API. */
export const protectedAccount = () =>
  new ApiError(
    409,
    'PROTECTED_ACCOUNT',
    'To konto jest chronione i nie można go w ten sposób zmienić',
  );

/**
 * Refuses to touch the permanent ADMIN account. This is the answer clients see; the database
 * triggers (migration 0001) refuse the same changes as a backstop, but only with a bare error.
 */
export function assertNotProtectedAccount(account: { loginNormalized: string }): void {
  if (account.loginNormalized === PROTECTED_LOGIN) throw protectedAccount();
}

/** What the lifecycle operations need to know about an account. */
const ACCOUNT = {
  id: users.id,
  loginNormalized: users.loginNormalized,
  deletedAt: users.deletedAt,
};

/** The account, deleted or not; "not found" only when there is no such row at all. */
function findAccount(tx: AppTransaction, id: string) {
  const account = tx.select(ACCOUNT).from(users).where(eq(users.id, id)).get();
  if (!account) throw new NotFoundError();
  return account;
}

/** The account, but a soft-deleted one counts as missing: it can no longer be managed. */
export function findLiveAccount(tx: Pick<AppTransaction, 'select'>, id: string) {
  const account = tx
    .select(ACCOUNT)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .get();
  if (!account) throw new NotFoundError();
  return account;
}

/**
 * Blocks the account and ends all of its sessions at once, so it loses access on its very next
 * request rather than at the idle timeout. The protected account cannot be blocked.
 */
export function blockUser(db: AppDb, id: string): AdminUserDto {
  return db.transaction(
    (tx) => {
      const account = findLiveAccount(tx, id);
      assertNotProtectedAccount(account);

      tx.update(users).set({ isBlocked: true }).where(eq(users.id, id)).run();
      revokeAllForUser(tx, id);
      return getUser(tx, id);
    },
    { behavior: 'immediate' },
  );
}

/**
 * Lets the account sign in again, and nothing more: sessions revoked by the block stay revoked,
 * and the password state (hash, forced change, expiry) is exactly as it was.
 */
export function unblockUser(db: AppDb, id: string): AdminUserDto {
  return db.transaction(
    (tx) => {
      findLiveAccount(tx, id);

      tx.update(users).set({ isBlocked: false }).where(eq(users.id, id)).run();
      return getUser(tx, id);
    },
    { behavior: 'immediate' },
  );
}

/**
 * Soft-deletes the account and ends all of its sessions. The row stays, with its reserved login,
 * so tickets, history and sessions keep a valid owner. Deleting twice is not an error and keeps
 * the time of the first deletion. The protected account cannot be deleted.
 */
export function softDeleteUser(db: AppDb, id: string): void {
  db.transaction(
    (tx) => {
      const account = findAccount(tx, id);
      assertNotProtectedAccount(account);

      if (!account.deletedAt) {
        tx.update(users).set({ deletedAt: clock.now() }).where(eq(users.id, id)).run();
      }
      revokeAllForUser(tx, id);
    },
    { behavior: 'immediate' },
  );
}

/** The new credential, to show to the administrator once; only its hash is stored. */
export interface PasswordReset {
  value: string;
  expiresAt: Date;
}

/**
 * Replaces the account's password with a fresh temporary one (16 characters, valid 12 hours),
 * forces a regular password at next login and ends every session of the account, all in one
 * transaction. The plaintext is returned and nowhere else: not stored, not logged.
 *
 * A regular password being replaced is filed under the account's password history first (cut back
 * to the five newest), so the user cannot choose it again afterwards; a temporary one is not, as
 * it was never chosen. `is_blocked` and `deleted_at` are not touched: resetting a blocked account
 * does not unblock it, and a soft-deleted one cannot be reset (404).
 *
 * The credential is made before the transaction opens, because hashing is asynchronous and a
 * better-sqlite3 transaction is not (the order `createUser` uses). The 12 hours therefore start
 * at the call, and a reset of a missing account costs one hash it then discards.
 */
export async function resetPassword(db: AppDb, id: string): Promise<PasswordReset> {
  const credential = await issueTemporaryCredential(clock);

  db.transaction(
    (tx) => {
      const account = tx
        .select({ passwordHash: users.passwordHash, mustChangePassword: users.mustChangePassword })
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .get();
      if (!account) throw new NotFoundError();

      if (!account.mustChangePassword) rememberPasswordHash(tx, id, account.passwordHash);
      applyTemporaryCredential(tx, id, credential);
      revokeAllForUser(tx, id);
    },
    { behavior: 'immediate' },
  );

  return { value: credential.plaintext, expiresAt: credential.expiresAt };
}
