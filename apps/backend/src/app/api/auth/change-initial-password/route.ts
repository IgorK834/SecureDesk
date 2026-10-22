import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionCookie } from '../../../../server/auth/cookie';
import { requireStage } from '../../../../server/auth/guards';
import { changeInitialPassword } from '../../../../server/auth/password-service';
import { db } from '../../../../server/db/client';
import { parseJsonBody } from '../../../../server/http/json-body';
import { handleRoute } from '../../../../server/http/route';
import { logEvent } from '../../../../server/security/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passwords are never trimmed or normalized. 1024 is the transport bound, as for login; the
// password policy (at most 128 characters) is applied by the service, which also rejects an
// empty or short new password, so the schema sets no minimum.
const ChangeInitialPasswordBody = z
  .object({
    newPassword: z.string().max(1024),
    confirmNewPassword: z.string().max(1024),
  })
  .strict();

/**
 * Replaces an administrator-issued password. Open only to the `INITIAL_PASSWORD_CHANGE` stage,
 * so the restriction lives in the session, not in the Angular routing: every other endpoint
 * refuses that stage with 403 `AUTH_PASSWORD_CHANGE_REQUIRED` unless its guard allows it (only
 * `GET /api/auth/me`, this endpoint and `POST /api/auth/logout` do). On success every session
 * of the user is revoked and a new fully authenticated one is returned in the cookie.
 *
 * NOTE: a state-changing request normally also needs CSRF protection. That mechanism is owned
 * by SD-27 and does not exist yet; SameSite=Lax on the cookie and the JSON-only body are the
 * only defenses until then.
 */
export const POST = handleRoute('auth.change_initial_password', async (request, requestId) => {
  const { session } = requireStage(request, ['INITIAL_PASSWORD_CHANGE']);
  const input = await parseJsonBody(request, ChangeInitialPasswordBody);

  const result = await changeInitialPassword(db, session, input);

  logEvent('auth.change_initial_password.success', requestId);
  const response = NextResponse.json(
    { user: result.user, authStage: result.authStage },
    { headers: { 'Cache-Control': 'no-store' } },
  );
  response.cookies.set(sessionCookie(result.session.token, result.session.expiresAt));
  return response;
});
