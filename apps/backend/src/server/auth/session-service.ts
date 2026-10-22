import { createHash, randomBytes } from 'node:crypto';
import { and, eq, getTableColumns, isNull, ne } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type AuthStage, rolePermissions, sessions, users } from '../db/schema';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';
import { type SafeUser, toSafeUser } from '../users/mappers';

const MINUTE_MS = 60 * 1000;

/**
 * A session ends this long after login however active it is. Together with the idle timeout it
 * bounds how long a stolen cookie is worth anything. Fixed in code, not an administrator setting.
 */
export const SESSION_ABSOLUTE_LIFETIME_MS = 12 * 60 * MINUTE_MS;

// 32 random bytes, base64url without padding: always exactly 43 characters of this alphabet.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** What the functions need from a database; a transaction handle qualifies too. */
type SessionDb = Pick<AppDb, 'select' | 'insert' | 'update'>;

/** A session without its token digest: nothing a caller could use to impersonate it. */
export interface SessionInfo {
  id: string;
  userId: string;
  authStage: AuthStage;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export interface CreatedSession {
  /** The only copy of the token. It goes into the cookie and is never stored or logged. */
  token: string;
  session: SessionInfo;
}

export interface ResolvedSession {
  session: SessionInfo;
  user: SafeUser;
  /** Permission codes granted by the user's role. */
  permissions: string[];
}

/** The digest stored in `sessions.token_hash`. The token has 256 bits of entropy, so a fast hash is enough. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function toSessionInfo(row: typeof sessions.$inferSelect): SessionInfo {
  return {
    id: row.id,
    userId: row.userId,
    authStage: row.authStage,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    expiresAt: row.expiresAt,
  };
}

export function createSession(db: SessionDb, userId: string, authStage: AuthStage): CreatedSession {
  const token = randomBytes(32).toString('base64url');
  const now = clock.now();
  const row = db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashSessionToken(token),
      authStage,
      createdAt: now,
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
    })
    .returning()
    .get();
  return { token, session: toSessionInfo(row) };
}

/**
 * Ends one session. Idempotent, and it keeps the first revocation time when called again.
 */
export function revokeSession(db: SessionDb, sessionId: string): void {
  db.update(sessions)
    .set({ revokedAt: clock.now() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .run();
}

/** Ends the session a raw token belongs to, if there is one. Unknown or malformed tokens are ignored. */
export function revokeSessionByToken(db: SessionDb, token: string): void {
  if (!TOKEN_PATTERN.test(token)) return;
  db.update(sessions)
    .set({ revokedAt: clock.now() })
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), isNull(sessions.revokedAt)))
    .run();
}

/**
 * Ends every live session of a user (password change, block, delete, reset), optionally sparing
 * one. Returns how many sessions it ended.
 */
export function revokeAllForUser(
  db: SessionDb,
  userId: string,
  options: { exceptSessionId?: string } = {},
): number {
  return db
    .update(sessions)
    .set({ revokedAt: clock.now() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        options.exceptSessionId ? ne(sessions.id, options.exceptSessionId) : undefined,
      ),
    )
    .run().changes;
}

/**
 * Replaces a session with a fresh token and the given stage, in one transaction. Used whenever
 * the privileges of a session change (for example after a forced password change), so a token
 * that was ever exposed at the old privilege level stops working.
 */
export function rotateSession(
  db: AppDb,
  current: SessionInfo,
  authStage: AuthStage,
): CreatedSession {
  return db.transaction((tx) => {
    revokeSession(tx, current.id);
    return createSession(tx, current.userId, authStage);
  });
}

/**
 * Turns a raw cookie token into the live session, its user and the role's permissions, or null.
 *
 * It is read-only for a valid session: whether a request counts as activity is decided by the
 * caller (`touchSession`), after the request has passed every check. Null means "not signed in"
 * whatever the reason, so a caller cannot tell a revoked token from a never-issued one. A session
 * found to be expired, or to belong to a blocked or deleted user, is revoked on the spot so it
 * cannot come back to life (for example when the user is unblocked or the idle timeout is raised).
 */
export function resolveSession(db: SessionDb, token: string | undefined): ResolvedSession | null {
  // A malformed value cannot be a token we issued, so it never reaches the database.
  if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return null;

  // One query for the session, its user and the role's permissions. The left join keeps a role
  // without any permission (guest) as a single row with a null permission.
  const rows = db
    .select({
      session: getTableColumns(sessions),
      user: getTableColumns(users),
      permission: rolePermissions.permissionId,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
    .where(eq(sessions.tokenHash, hashSessionToken(token)))
    .all();

  const first = rows[0];
  if (!first || first.session.revokedAt !== null) return null;

  const { session, user } = first;
  const nowMs = clock.now().getTime();
  // The idle timeout is read on every request so a change by an administrator applies at once.
  const idleLimitMs = readSecuritySettings(db).sessionIdleTimeoutMinutes * MINUTE_MS;

  const unusable =
    user.deletedAt !== null ||
    user.isBlocked ||
    nowMs >= session.expiresAt.getTime() ||
    nowMs - session.lastActivityAt.getTime() >= idleLimitMs;
  if (unusable) {
    revokeSession(db, session.id);
    return null;
  }

  return {
    session: toSessionInfo(session),
    user: toSafeUser(user),
    permissions: rows.flatMap((row) => (row.permission === null ? [] : [row.permission])),
  };
}

/** Records activity. Call it only for a request that was authenticated and authorized. */
export function touchSession(db: SessionDb, sessionId: string): void {
  db.update(sessions)
    .set({ lastActivityAt: clock.now() })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .run();
}
