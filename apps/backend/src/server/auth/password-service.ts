import { and, desc, eq, notInArray } from 'drizzle-orm';
import type { AppDb, AppTransaction } from '../db/connection';
import { type UserRow, passwordHistory, users } from '../db/schema';
import { ApiError } from '../http/errors';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';
import { type Profile, toProfile } from '../users/mappers';
import { hashPassword, verifyPassword } from './password-hasher';
import { validateNewPassword } from './password-policy';
import {
  type CreatedSession,
  type SessionInfo,
  createSession,
  revokeAllForUser,
  revokeSession,
} from './session-service';
import { isTemporaryPasswordExpired } from './temporary-password';

// Both ways a signed-in user replaces their password: the forced change after an administrator
// issued one (`changeInitialPassword`) and the ordinary change (`changePassword`, which also
// resolves an expired password). They share the same checks and the same ending: the credential
// is replaced, every session of the user is revoked and a fresh fully authenticated one is
// issued, all in one transaction, so a failure leaves nothing half done.
//
// Both throw `ApiError` (the pattern of the guards and of `defineRoute`), so a route built with
// `defineRoute` needs no translation. Nothing here logs: a password, hash or token must never
// reach a log line, and `defineRoute` records only the event name and the request id.

/** How many previous regular passwords are remembered, besides the current one (project decision). */
export const PASSWORD_HISTORY_SIZE = 5;

export interface ChangePasswordInput {
  /** Exactly as typed: never trimmed or normalized. The same holds for the other passwords. */
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface ChangeInitialPasswordInput {
  newPassword: string;
  confirmNewPassword: string;
}

export interface PasswordChangeResult {
  user: Profile;
  authStage: 'FULLY_AUTHENTICATED' | 'TOTP_CHALLENGE';
  /** The only copy of the new token: for the cookie, never to be stored or logged. */
  session: { id: string; token: string; expiresAt: Date };
}

const notSignedIn = () => new ApiError(401, 'AUTH_REQUIRED', 'Wymagane zalogowanie');

// One code for "the credential this request checked is no longer the stored one": the change was
// already completed, or something else (a concurrent request, an administrator reset) replaced it.
const alreadyCompleted = () =>
  new ApiError(409, 'PASSWORD_CHANGE_ALREADY_COMPLETED', 'Zmiana hasła została już wykonana');

/** The account as it is now. The guard ran earlier, so it can only have changed in between. */
function loadActiveUser(db: AppDb, userId: string): UserRow {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.deletedAt !== null || user.isBlocked) throw notSignedIn();
  return user;
}

function assertConfirmed(input: { newPassword: string; confirmNewPassword: string }): void {
  if (input.newPassword !== input.confirmNewPassword) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Nieprawidłowe dane żądania', {
      fieldErrors: { confirmNewPassword: 'PASSWORDS_DO_NOT_MATCH' },
    });
  }
}

// Only fixed violation codes leave the server. The message is the same for every violation and
// names no profile data: the client turns the codes into specific text.
function assertPasswordPolicy(db: AppDb, user: UserRow, newPassword: string): void {
  const violations = validateNewPassword(newPassword, user, readSecuritySettings(db));
  if (violations.length > 0) {
    throw new ApiError(
      400,
      'PASSWORD_POLICY_VIOLATION',
      'Hasło nie spełnia wymagań bezpieczeństwa',
      { violations },
    );
  }
}

/**
 * Refuses a password equal to the current one or to one of the five most recent regular
 * passwords (400 `PASSWORD_REUSED`). Salts differ, so hashes cannot be compared: the candidate is
 * verified against each stored hash. While the account still has an administrator-issued
 * password, the current hash is that temporary password, so the same check also refuses keeping
 * it. Shared by both password-change flows.
 */
export async function assertNotReused(
  db: Pick<AppDb, 'select'>,
  userId: string,
  newPassword: string,
): Promise<void> {
  const current = db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!current) throw new Error('Cannot check password reuse: user not found.');

  const history = db
    .select({ passwordHash: passwordHistory.passwordHash })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt), desc(passwordHistory.id))
    .limit(PASSWORD_HISTORY_SIZE)
    .all();

  for (const { passwordHash } of [current, ...history]) {
    if (await verifyPassword(passwordHash, newPassword)) {
      throw new ApiError(
        400,
        'PASSWORD_REUSED',
        'Nowe hasło nie może być takie samo jak obecne ani jedno z pięciu poprzednich',
      );
    }
  }
}

/**
 * Files the hash of a regular password the user is leaving behind under their history, then cuts
 * the history back to the `PASSWORD_HISTORY_SIZE` newest entries. Call it inside the transaction
 * that replaces the password, so the old hash is never lost or kept twice. Never pass a temporary
 * password's hash: it was not chosen by the user and must not count against what they may pick.
 * Shared by the ordinary password change and the administrator's reset.
 */
export function rememberPasswordHash(
  tx: AppTransaction,
  userId: string,
  passwordHash: string,
): void {
  tx.insert(passwordHistory).values({ userId, passwordHash }).run();
  const newest = tx
    .select({ id: passwordHistory.id })
    .from(passwordHistory)
    .where(eq(passwordHistory.userId, userId))
    .orderBy(desc(passwordHistory.createdAt), desc(passwordHistory.id))
    .limit(PASSWORD_HISTORY_SIZE);
  tx.delete(passwordHistory)
    .where(and(eq(passwordHistory.userId, userId), notInArray(passwordHistory.id, newest)))
    .run();
}

function nextStage(user: UserRow): PasswordChangeResult['authStage'] {
  return user.totpEnabledAt ? 'TOTP_CHALLENGE' : 'FULLY_AUTHENTICATED';
}

function toResult(user: UserRow, created: CreatedSession): PasswordChangeResult {
  return {
    user: toProfile(user),
    authStage: nextStage(user),
    session: {
      id: created.session.id,
      token: created.token,
      expiresAt: created.session.expiresAt,
    },
  };
}

/**
 * The ordinary password change, for a fully authenticated session or one whose password has
 * expired. The current password must be proven first; a wrong one is refused (400
 * `CURRENT_PASSWORD_INCORRECT`) before anything is written.
 *
 * The old hash joins the history (only when it was a regular password) and the history is cut
 * back to the five newest entries, in the same transaction that installs the new hash and
 * replaces the user's sessions.
 */
export async function changePassword(
  db: AppDb,
  session: SessionInfo,
  input: ChangePasswordInput,
): Promise<PasswordChangeResult> {
  const user = loadActiveUser(db, session.userId);

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', 'Obecne hasło jest niepoprawne');
  }
  assertConfirmed(input);
  assertPasswordPolicy(db, user, input.newPassword);
  await assertNotReused(db, user.id, input.newPassword);

  // Hashing is asynchronous and a transaction is synchronous, so the hash is made first.
  const newHash = await hashPassword(input.newPassword);
  const now = clock.now();

  const created = db.transaction(
    (tx) => {
      // Guarded by the hash that was verified above: if another request replaced the password in
      // the meantime this one must not overwrite it, nor file the wrong hash as "previous".
      const { changes } = tx
        .update(users)
        .set({ passwordHash: newHash, passwordChangedAt: now, updatedAt: now })
        .where(and(eq(users.id, user.id), eq(users.passwordHash, user.passwordHash)))
        .run();
      if (changes === 0) throw alreadyCompleted();

      // A temporary password is never remembered: it was not chosen by the user.
      if (!user.mustChangePassword) rememberPasswordHash(tx, user.id, user.passwordHash);

      revokeAllForUser(tx, user.id);
      return createSession(tx, user.id, nextStage(user));
    },
    { behavior: 'immediate' },
  );

  return toResult(user, created);
}

/**
 * The forced change of an administrator-issued password: the only way out of the
 * `INITIAL_PASSWORD_CHANGE` stage. The 12-hour deadline is checked again here, because a session
 * can outlive the password it was opened with; an expired one ends the session (401
 * `AUTH_TEMPORARY_PASSWORD_EXPIRED`). The temporary hash is not written to the history.
 */
export async function changeInitialPassword(
  db: AppDb,
  session: SessionInfo,
  input: ChangeInitialPasswordInput,
): Promise<PasswordChangeResult> {
  const user = loadActiveUser(db, session.userId);
  // Reachable only when a concurrent request completed the change after this one was admitted.
  if (!user.mustChangePassword) throw alreadyCompleted();

  // A NULL expiry means "no deadline" (the seeded ADMIN's bootstrap password), as at login.
  const expiresAt = user.temporaryPasswordExpiresAt;
  if (expiresAt !== null && isTemporaryPasswordExpired(expiresAt, clock.now())) {
    revokeSession(db, session.id);
    throw new ApiError(401, 'AUTH_TEMPORARY_PASSWORD_EXPIRED', 'Hasło tymczasowe wygasło');
  }

  assertConfirmed(input);
  assertPasswordPolicy(db, user, input.newPassword);
  await assertNotReused(db, user.id, input.newPassword);

  const newHash = await hashPassword(input.newPassword);
  const now = clock.now();

  const created = db.transaction(
    (tx) => {
      // The guard is what makes two concurrent requests with the same session safe: the first
      // flips the flag, so the second matches no row. The hash condition also stops this request
      // from overwriting a temporary password an administrator reissued while it was running.
      const { changes } = tx
        .update(users)
        .set({
          passwordHash: newHash,
          mustChangePassword: false,
          temporaryPasswordExpiresAt: null,
          passwordChangedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, user.id),
            eq(users.mustChangePassword, true),
            eq(users.passwordHash, user.passwordHash),
          ),
        )
        .run();
      if (changes === 0) throw alreadyCompleted();

      revokeAllForUser(tx, user.id);
      return createSession(tx, user.id, nextStage(user));
    },
    { behavior: 'immediate' },
  );

  return toResult(user, created);
}
