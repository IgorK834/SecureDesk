import type { NextRequest } from 'next/server';
import { db } from '../db/client';
import { AUTH_STAGES, type AuthStage } from '../db/schema';
import { ApiError } from '../http/route';
import type { PermissionCode } from '../permissions/codes';
import { readSessionToken } from './cookie';
import { type ResolvedSession, resolveSession, touchSession } from './session-service';

// A session still owes a password change in these stages. It may call only what it is allowed.
const RESTRICTED_STAGES: readonly AuthStage[] = ['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'];

export interface GuardOptions {
  /** The role must grant this permission, otherwise the guard answers 403 `AUTH_FORBIDDEN`. */
  permission?: PermissionCode;
}

/**
 * Admits a request whose session is in one of `stages`, or throws an `ApiError` (use the route
 * wrapper): 401 `AUTH_REQUIRED` for no valid session, 403 `AUTH_PASSWORD_CHANGE_REQUIRED` for a
 * session that still owes a password change, 403 `AUTH_FORBIDDEN` for anything else not allowed.
 *
 * Inactivity is measured from the last request that got through, so activity is recorded only
 * after every check above has passed. A refused request, including one from an attacker who
 * replays an old cookie against a forbidden endpoint, never extends a session. The returned
 * snapshot is what was read before that update.
 */
export function requireStage(
  request: NextRequest,
  stages: readonly AuthStage[],
  options: GuardOptions = {},
): ResolvedSession {
  const resolved = resolveSession(db, readSessionToken(request));
  if (!resolved) throw new ApiError(401, 'AUTH_REQUIRED', 'Wymagane zalogowanie');

  const { authStage } = resolved.session;
  if (!stages.includes(authStage)) {
    if (RESTRICTED_STAGES.includes(authStage)) {
      throw new ApiError(403, 'AUTH_PASSWORD_CHANGE_REQUIRED', 'Wymagana zmiana hasła');
    }
    throw new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');
  }
  if (options.permission && !resolved.permissions.includes(options.permission)) {
    throw new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');
  }

  touchSession(db, resolved.session.id);
  return resolved;
}

/** Any signed-in session, including one that must still change its password (for `/me`, logout). */
export function requireSession(request: NextRequest, options?: GuardOptions): ResolvedSession {
  return requireStage(request, AUTH_STAGES, options);
}

/** A fully authenticated session: the default for every business endpoint. */
export function requireFullSession(request: NextRequest, options?: GuardOptions): ResolvedSession {
  return requireStage(request, ['FULLY_AUTHENTICATED'], options);
}
