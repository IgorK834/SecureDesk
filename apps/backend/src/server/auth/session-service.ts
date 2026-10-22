// MINIMAL STAND-IN for Task 2.3 (session service). It provides only what login needs: creating a
// session (and revoking the one the request already carried) and the cookie that carries it.
// requireSession(), idle-timeout checks, token rotation, /me and /logout belong to Task 2.3.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type AuthStage, sessions } from '../db/schema';
import { clock } from '../time/clock';

/** Hard upper bound on a session's life, whatever the activity. A provisional value for Task 2.3. */
export const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

// Secure unless COOKIE_SECURE is explicitly "false" (plain-HTTP local development), so forgetting
// the variable in a deployment fails safe.
function secureCookies(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

/** The `__Host-` prefix makes browsers insist on Secure, Path=/ and no Domain, so it needs HTTPS. */
export function sessionCookieName(): string {
  return secureCookies() ? '__Host-securedesk_session' : 'securedesk_session';
}

/** Only this digest is stored, so a copy of the database cannot be replayed as a cookie. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface NewSession {
  userId: string;
  authStage: AuthStage;
  /** The token of a session the request already carried: revoked in the same transaction. */
  replacesToken?: string;
}

/**
 * Creates a session with a brand-new random token (256 bits). If the request carried a session
 * cookie it is revoked in the same transaction, so an identifier planted before login (session
 * fixation) is dead the moment the user authenticates.
 */
export function createSession(
  db: AppDb,
  { userId, authStage, replacesToken }: NewSession,
): { token: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  const now = clock.now();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);

  db.transaction((tx) => {
    if (replacesToken !== undefined) {
      tx.update(sessions)
        .set({ revokedAt: now })
        .where(
          and(eq(sessions.tokenHash, hashSessionToken(replacesToken)), isNull(sessions.revokedAt)),
        )
        .run();
    }
    tx.insert(sessions)
      .values({
        userId,
        tokenHash: hashSessionToken(token),
        authStage,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
      })
      .run();
  });

  return { token, expiresAt };
}

/** HttpOnly (no script access), SameSite=Lax, host-only (no Domain), Path=/. */
export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: sessionCookieName(),
    value: token,
    httpOnly: true,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}
