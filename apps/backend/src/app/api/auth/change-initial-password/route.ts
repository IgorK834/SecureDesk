import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionCookie } from '../../../../server/auth/cookie';
import { changeInitialPassword } from '../../../../server/auth/password-service';
import { db } from '../../../../server/db/client';
import { defineRoute } from '../../../../server/http/route-handler';
import { verifyCaptchaOrThrow } from '../../../../server/security/captcha';
import { csrfCookie } from '../../../../server/security/csrf';
import { logEvent } from '../../../../server/security/log-event';
import { getClientIp } from '../../../../server/security/rate-limiter';
import { clock } from '../../../../server/time/clock';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Passwords are never trimmed or normalized. 1024 is the transport bound, as for login; the
// password policy (at most 128 characters) is applied by the service, which also rejects an
// empty or short new password, so the schema sets no minimum.
const ChangeInitialPasswordBody = z
  .object({
    newPassword: z.string().max(1024),
    confirmNewPassword: z.string().max(1024),
    captcha: z
      .union([
        z.object({ token: z.string().min(1).max(2048) }).strict(),
        z
          .object({
            challengeId: z.string().min(1).max(128),
            answer: z.string().min(1).max(128),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict();

/**
 * Replaces an administrator-issued password. Open only to the `INITIAL_PASSWORD_CHANGE` stage,
 * so the restriction lives in the session, not in the Angular routing: every other endpoint
 * refuses that stage with 403 `AUTH_PASSWORD_CHANGE_REQUIRED` unless its `auth.stages` lists it
 * (only `GET /api/auth/me`, this endpoint and `POST /api/auth/logout` do). It needs no
 * permission: the stage is the authorization. On success every session of the user is revoked
 * and a new fully authenticated one is returned in the cookie.
 *
 */
export const POST = defineRoute({
  name: 'auth.change_initial_password',
  auth: { stages: ['INITIAL_PASSWORD_CHANGE'] },
  body: ChangeInitialPasswordBody,
  handler: async ({ request, requestId, session, body }) => {
    await verifyCaptchaOrThrow(body.captcha, {
      db,
      purpose: 'change-password',
      ipKey: getClientIp(request),
      now: clock.now(),
      requestId,
      userAgent: request.headers.get('user-agent'),
    });
    const result = await changeInitialPassword(db, session.session, body);

    logEvent('auth.change_initial_password.success', requestId);
    const response = NextResponse.json(
      { user: result.user, authStage: result.authStage },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(sessionCookie(result.session.token, result.session.expiresAt));
    response.cookies.set(csrfCookie(result.session.id, result.session.expiresAt));
    return response;
  },
});
