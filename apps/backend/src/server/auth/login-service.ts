import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import { canonicalDetails } from '../audit/chain';
import { requestAudit, type AuditContext } from '../audit/context';
import { subjectFor, type AuditSubject } from '../audit/subject';
import type { AppDb } from '../db/connection';
import { auditLog, type AuthStage, type UserRow, users } from '../db/schema';
import { AccountLockedError } from '../http/errors';
import { markCredentialAttempt, resolveAttempt } from '../security/attempt-tracker';
import { AGGREGATION_BUCKET_MS } from '../security/events';
import { logEvent } from '../security/log-event';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';
import { normalizeLogin } from '../users/login';
import { type Profile, toProfile } from '../users/mappers';
import { runLoginGuard, type LoginGuardResult } from './login-guard';
import { getDummyHash, verifyPassword } from './password-hasher';
import { createSession, revokeSessionByToken } from './session-service';
import { isTemporaryPasswordExpired } from './temporary-password';

export interface LoginInput {
  login: string;
  /** Exactly as typed: never trimmed or normalized. */
  password: string;
  captcha?: unknown;
  website?: string;
}

export interface LoginContext {
  db: AppDb;
  ip: string;
  userAgent?: string | null;
  audit: AuditContext;
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

function recordLoginFailure(
  { db, audit }: LoginContext,
  reason: Extract<LoginGuardResult, { status: 'refused' }>['reason'] | 'BAD_CREDENTIALS',
  subject: AuditSubject,
): void {
  const entry = {
    action: 'AUTH_LOGIN_FAILURE',
    outcome: 'FAILURE',
    details: { reason },
    subject,
  } as const;
  if (reason !== 'IP_BLOCKED') {
    audit.record(db, entry, 'refusal');
    return;
  }

  // Serialize the lookup and append across connections. Use the full address in the audit row.
  try {
    db.transaction(
      (tx) => {
        const now = clock.now().getTime();
        const bucket = now - (now % AGGREGATION_BUCKET_MS);
        const existing = tx
          .select({ seq: auditLog.seq })
          .from(auditLog)
          .where(
            and(
              eq(auditLog.action, entry.action),
              audit.ip === null ? isNull(auditLog.ip) : eq(auditLog.ip, audit.ip),
              eq(auditLog.details, canonicalDetails(entry.details)),
              gte(auditLog.occurredAt, new Date(bucket).toISOString()),
              lt(auditLog.occurredAt, new Date(bucket + AGGREGATION_BUCKET_MS).toISOString()),
            ),
          )
          .limit(1)
          .get();
        if (!existing) audit.record(tx, entry, 'refusal');
      },
      { behavior: 'immediate' },
    );
  } catch {
    logEvent('audit.append.failure', audit.requestId);
  }
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
      requestId: ctx.audit.requestId,
      now: clock.now(),
      captcha: input.captcha,
      password: input.password,
      website: input.website,
    },
    {
      db: ctx.db,
      audit: ctx.audit,
      maxAttempts: settings.maxFailedLoginAttempts,
      ipFailedAttemptLimit: settings.ipFailedAttemptLimit,
    },
  );
  if (guard.status === 'refused') {
    const account = ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.loginNormalized, normalizedLogin), isNull(users.deletedAt)))
      .get();
    recordLoginFailure(ctx, guard.reason, subjectFor(normalizedLogin, Boolean(account)));
    throw guard.error;
  }

  const resolveFailure = (accountExists: boolean) => {
    const now = clock.now();
    const subject = subjectFor(normalizedLogin, accountExists);
    const resolved = resolveAttempt(ctx.db, guard.attemptId, 'FAILED', {
      now,
      maxAttempts: settings.maxFailedLoginAttempts,
      requestId: ctx.audit.requestId,
      userAgent: ctx.userAgent,
      sprayingDistinctLoginThreshold: settings.sprayingDistinctLoginThreshold,
      audit: { ip: ctx.audit.ip, subject },
    });
    recordLoginFailure(ctx, 'BAD_CREDENTIALS', subject);
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
    return resolveFailure(Boolean(user));
  }

  const now = clock.now();
  // A NULL expiry means "no deadline" (the seeded ADMIN's bootstrap password).
  const expiry = user.temporaryPasswordExpiresAt;
  if (user.mustChangePassword && expiry !== null && isTemporaryPasswordExpired(expiry, now)) {
    return resolveFailure(true);
  }

  const authStage = authStageFor(user, ctx.db, now);
  const signedInAudit = requestAudit(ctx.audit.requestId, ctx.audit.ip, user);
  // A token the request already carried is revoked as the new session is created, in one
  // transaction, so a token planted before login (session fixation) never gains the user's rights.
  const created = ctx.db.transaction(
    (tx) => {
      markCredentialAttempt(tx, guard.attemptId, 'SUCCESS', now);
      if (ctx.presentedSessionToken) revokeSessionByToken(tx, ctx.presentedSessionToken);
      const session = createSession(tx, user.id, authStage);
      signedInAudit.record(tx, {
        action: 'AUTH_LOGIN_SUCCESS',
        outcome: 'SUCCESS',
        details: {},
        subject: { subjectLogin: normalizedLogin },
      });
      return session;
    },
    { behavior: 'immediate' },
  );

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
