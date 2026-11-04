import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type AuthStage, type UserRow, users } from '../db/schema';
import { AccountLockedError } from '../http/errors';
import { resolveAttempt } from '../security/attempt-tracker';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';
import { normalizeLogin } from '../users/login';
import { type Profile, toProfile } from '../users/mappers';
import { runLoginGuard } from './login-guard';
import { getDummyHash, verifyPassword } from './password-hasher';
import { createSession, revokeSessionByToken } from './session-service';
import { isTemporaryPasswordExpired } from './temporary-password';

export interface LoginInput {
  login: string;
  /** Exactly as typed: never trimmed or normalized. */
  password: string;
  captcha?: unknown;
}

export interface LoginContext {
  db: AppDb;
  ip: string;
  userAgent?: string | null;
  requestId: string;
  /** The session token the request already carried, if any. It is revoked on a successful login. */
  presentedSessionToken?: string;
}

export type LoginResult =
  | {
      outcome: 'authenticated';
      user: Profile;
      authStage: AuthStage;
      mustChangePassword: boolean;
      session: { id: string; token: string; expiresAt: Date };
    }
  // One outcome for every way credentials can be refused, so callers cannot tell them apart.
  | { outcome: 'invalid_credentials' };

const INVALID_CREDENTIALS: LoginResult = { outcome: 'invalid_credentials' };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The stage of a session for a user whose password is correct and whose temporary password (if
 * any) is still valid.
 */
function authStageFor(user: UserRow, db: AppDb, now: Date): AuthStage {
  if (user.mustChangePassword) return 'INITIAL_PASSWORD_CHANGE';

  // A missing settings row means the defaults: password expiry disabled.
  const { passwordMaxAgeDays: maxAgeDays } = readSecuritySettings(db);
  if (maxAgeDays === null) return user.totpEnabledAt ? 'TOTP_CHALLENGE' : 'FULLY_AUTHENTICATED';

  // No recorded change date while expiry is on cannot be proven fresh, so it counts as expired.
  const changedAt = user.passwordChangedAt;
  if (changedAt === null || now.getTime() - changedAt.getTime() > maxAgeDays * DAY_MS) {
    return 'PASSWORD_EXPIRED';
  }
  return user.totpEnabledAt ? 'TOTP_CHALLENGE' : 'FULLY_AUTHENTICATED';
}

/**
 * Checks a login and, if it is valid, opens a session. Every refusal is the same
 * `invalid_credentials` result, and every attempt costs exactly one Argon2id verification
 * (against a dummy hash when the login is unknown), so neither the result nor the response time
 * reveals whether an account exists, is blocked or deleted, or only has an expired temporary
 * password.
 */
export async function authenticate(input: LoginInput, ctx: LoginContext): Promise<LoginResult> {
  const normalizedLogin = normalizeLogin(input.login);
  const settings = readSecuritySettings(ctx.db);
  const guard = await runLoginGuard(
    {
      ip: ctx.ip,
      normalizedLogin,
      userAgent: ctx.userAgent ?? null,
      requestId: ctx.requestId,
      now: clock.now(),
      captcha: input.captcha,
    },
    {
      db: ctx.db,
      maxAttempts: settings.maxFailedLoginAttempts,
      ipFailedAttemptLimit: settings.ipFailedAttemptLimit,
    },
  );
  if (guard.status === 'refused') throw guard.error;

  const resolveFailure = () => {
    const now = clock.now();
    const resolved = resolveAttempt(ctx.db, guard.attemptId, 'FAILED', {
      now,
      maxAttempts: settings.maxFailedLoginAttempts,
      requestId: ctx.requestId,
      userAgent: ctx.userAgent,
      sprayingDistinctLoginThreshold: settings.sprayingDistinctLoginThreshold,
    });
    if (resolved.lockedUntil) {
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((resolved.lockedUntil.getTime() - now.getTime()) / 1000),
      );
      throw new AccountLockedError(resolved.lockedUntil, retryAfterSeconds);
    }
    return INVALID_CREDENTIALS;
  };

  // Soft-deleted accounts are not found at all, so they take the unknown-login path.
  const user = ctx.db
    .select()
    .from(users)
    .where(and(eq(users.loginNormalized, normalizedLogin), isNull(users.deletedAt)))
    .get();

  // Asked for on every attempt, known login or not: the first call in a process has to compute the
  // hash, and if only unknown logins paid for that, the first attempt would show which logins exist.
  const dummyHash = await getDummyHash();
  const passwordMatches = await verifyPassword(
    user ? user.passwordHash : dummyHash,
    input.password,
  );
  if (!user || !passwordMatches || user.isBlocked) {
    return resolveFailure();
  }

  const now = clock.now();
  // A NULL expiry means "no deadline" (the seeded ADMIN's bootstrap password).
  const expiry = user.temporaryPasswordExpiresAt;
  if (user.mustChangePassword && expiry !== null && isTemporaryPasswordExpired(expiry, now)) {
    return resolveFailure();
  }

  resolveAttempt(ctx.db, guard.attemptId, 'SUCCESS', {
    now,
    maxAttempts: settings.maxFailedLoginAttempts,
    requestId: ctx.requestId,
    userAgent: ctx.userAgent,
  });

  const authStage = authStageFor(user, ctx.db, now);
  // A token the request already carried is revoked as the new session is created, in one
  // transaction, so a token planted before login (session fixation) never gains the user's rights.
  const created = ctx.db.transaction((tx) => {
    if (ctx.presentedSessionToken) revokeSessionByToken(tx, ctx.presentedSessionToken);
    return createSession(tx, user.id, authStage);
  });

  return {
    outcome: 'authenticated',
    user: toProfile(user),
    authStage,
    mustChangePassword: user.mustChangePassword,
    session: {
      id: created.session.id,
      token: created.token,
      expiresAt: created.session.expiresAt,
    },
  };
}
