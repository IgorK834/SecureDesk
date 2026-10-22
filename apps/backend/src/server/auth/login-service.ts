import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type AuthStage, type UserRow, securitySettings, users } from '../db/schema';
import { loginRateLimiter } from '../security/login-rate-limiter';
import { clock } from '../time/clock';
import { normalizeLogin } from '../users/login';
import { getDummyHash, verifyPassword } from './password-hasher';
import { createSession } from './session-service';

export interface LoginInput {
  login: string;
  /** Exactly as typed: never trimmed or normalized. */
  password: string;
}

export interface LoginContext {
  db: AppDb;
  /** Who is calling (the client address); only used for rate limiting. */
  clientKey: string;
  /** The session token the request already carried, if any. It is revoked on a successful login. */
  presentedSessionToken?: string;
}

/** The only user fields a login response may contain. */
export interface LoginUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  role: string;
}

export type LoginResult =
  | {
      outcome: 'authenticated';
      user: LoginUser;
      authStage: AuthStage;
      mustChangePassword: boolean;
      session: { token: string; expiresAt: Date };
    }
  // One outcome for every way credentials can be refused, so callers cannot tell them apart.
  | { outcome: 'invalid_credentials' }
  | { outcome: 'rate_limited'; retryAfterSeconds: number };

const INVALID_CREDENTIALS: LoginResult = { outcome: 'invalid_credentials' };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The stage of a session for a user whose password is correct and whose temporary password (if
 * any) is still valid.
 */
function authStageFor(user: UserRow, db: AppDb, now: Date): AuthStage {
  if (user.mustChangePassword) return 'INITIAL_PASSWORD_CHANGE';

  // A missing settings row means the defaults: password expiry disabled.
  const maxAgeDays = db.select().from(securitySettings).get()?.passwordMaxAgeDays ?? null;
  if (maxAgeDays === null) return 'FULLY_AUTHENTICATED';

  // No recorded change date while expiry is on cannot be proven fresh, so it counts as expired.
  const changedAt = user.passwordChangedAt;
  if (changedAt === null || now.getTime() - changedAt.getTime() > maxAgeDays * DAY_MS) {
    return 'PASSWORD_EXPIRED';
  }
  return 'FULLY_AUTHENTICATED';
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

  const decision = await loginRateLimiter.check(ctx.clientKey, normalizedLogin);
  if (!decision.allowed) {
    return { outcome: 'rate_limited', retryAfterSeconds: decision.retryAfterSeconds };
  }

  // Soft-deleted accounts are not found at all, so they take the unknown-login path.
  const user = ctx.db
    .select()
    .from(users)
    .where(and(eq(users.loginNormalized, normalizedLogin), isNull(users.deletedAt)))
    .get();

  const passwordMatches = await verifyPassword(
    user ? user.passwordHash : await getDummyHash(),
    input.password,
  );
  if (!user || !passwordMatches || user.isBlocked) return INVALID_CREDENTIALS;

  const now = clock.now();
  // A NULL expiry means "no deadline" (the seeded ADMIN's bootstrap password).
  const expiry = user.temporaryPasswordExpiresAt;
  if (user.mustChangePassword && expiry !== null && expiry.getTime() <= now.getTime()) {
    return INVALID_CREDENTIALS;
  }

  const authStage = authStageFor(user, ctx.db, now);
  const session = createSession(ctx.db, {
    userId: user.id,
    authStage,
    replacesToken: ctx.presentedSessionToken,
  });

  return {
    outcome: 'authenticated',
    user: {
      id: user.id,
      login: user.login,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.roleId.toUpperCase(),
    },
    authStage,
    mustChangePassword: user.mustChangePassword,
    session,
  };
}
