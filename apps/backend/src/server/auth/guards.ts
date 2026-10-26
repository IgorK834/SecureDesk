import type { NextRequest } from 'next/server';
import { db } from '../db/client';
import type { AuthStage } from '../db/schema';
import {
  ForbiddenError,
  PasswordChangeRequiredError,
  TotpChallengeRequiredError,
  UnauthorizedError,
} from '../http/errors';
import { requirePermission } from '../permissions/authorize';
import type { PermissionCode } from '../permissions/codes';
import { readSessionToken } from './cookie';
import { type ResolvedSession, resolveSession } from './session-service';

// A session still owes a password change in these stages. It may call only what it is allowed.
const RESTRICTED_STAGES: readonly AuthStage[] = ['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'];

export interface GuardOptions {
  /**
   * The role must grant this permission (or, for a list, at least one of them), otherwise the
   * guard answers 403 `AUTH_FORBIDDEN`.
   */
  permission?: PermissionCode | readonly PermissionCode[];
}

/**
 * Admits a request whose session is in one of `stages`, or throws: 401 `AUTH_REQUIRED` for no valid
 * session, 403 `AUTH_PASSWORD_CHANGE_REQUIRED` for a session that still owes a password change,
 * 403 `AUTH_FORBIDDEN` for anything else not allowed. Routes do not call it themselves:
 * `defineRoute` does, as the first steps of its pipeline.
 *
 * It deliberately does not record activity. Inactivity is measured from the last request that got
 * through, and "got through" includes the checks that run after this one (CSRF), so `defineRoute`
 * touches the session only once everything has passed. A refused request, including one from an
 * attacker who replays an old cookie against a forbidden endpoint, never extends a session.
 */
export function requireStage(
  request: NextRequest,
  stages: readonly AuthStage[],
  options: GuardOptions = {},
): ResolvedSession {
  const resolved = resolveSession(db, readSessionToken(request));
  if (!resolved) throw new UnauthorizedError();

  const { authStage } = resolved.session;
  if (!stages.includes(authStage)) {
    if (authStage === 'TOTP_CHALLENGE') throw new TotpChallengeRequiredError();
    throw RESTRICTED_STAGES.includes(authStage)
      ? new PasswordChangeRequiredError()
      : new ForbiddenError();
  }
  if (options.permission) requirePermission(resolved, options.permission);

  return resolved;
}
