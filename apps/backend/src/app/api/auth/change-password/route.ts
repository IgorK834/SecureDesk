import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionCookie } from '../../../../server/auth/cookie';
import { changePassword } from '../../../../server/auth/password-service';
import { db } from '../../../../server/db/client';
import { defineRoute } from '../../../../server/http/route-handler';
import { logEvent } from '../../../../server/security/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passwords are never trimmed or normalized. 1024 is the transport bound, as for login; the
// password policy (at most 128 characters) is applied by the service, which also rejects an
// empty or short new password, so the schema sets no minimum for it.
const ChangePasswordBody = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().max(1024),
    confirmNewPassword: z.string().max(1024),
  })
  .strict();

/**
 * Changes the caller's own password after they prove the current one. Open to a fully
 * authenticated session and to one whose password has expired (the way out of that stage). It
 * needs no permission: every signed-in user may change their own password. On success every
 * session of the user is revoked and a new fully authenticated one is returned in the cookie, so
 * this response is the only place the new token appears.
 *
 * NOTE: a state-changing request normally also needs CSRF protection. That mechanism is owned
 * by SD-27 and does not exist yet; SameSite=Lax on the cookie and the JSON-only body are the
 * only defenses until then.
 */
export const POST = defineRoute({
  name: 'auth.change_password',
  auth: { stages: ['FULLY_AUTHENTICATED', 'PASSWORD_EXPIRED'] },
  body: ChangePasswordBody,
  handler: async ({ requestId, session, body }) => {
    const result = await changePassword(db, session.session, body);

    logEvent('auth.change_password.success', requestId);
    const response = NextResponse.json(
      { user: result.user, authStage: result.authStage },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(sessionCookie(result.session.token, result.session.expiresAt));
    return response;
  },
});
