import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken, sessionCookie } from '../../../../server/auth/cookie';
import { authenticate } from '../../../../server/auth/login-service';
import { db } from '../../../../server/db/client';
import { errorResponse } from '../../../../server/http/errors';
import { defineRoute } from '../../../../server/http/route-handler';
import { csrfCookie } from '../../../../server/security/csrf';
import { logEvent } from '../../../../server/security/log-event';
import { getClientIp } from '../../../../server/security/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginBody = z
  .object({
    login: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(1024), // never trim or normalize the password
    captcha: z
      .union([
        z.object({ token: z.string().min(1).max(4096) }).strict(),
        z
          .object({
            challengeId: z.string().min(1).max(128),
            answer: z.string().min(1).max(128),
          })
          .strict(),
      ])
      .optional(),
    website: z.string().max(256).optional(),
    formToken: z.string().min(1).max(4096).optional(),
  })
  .strict();

// Public by necessity (there is no session yet) and on the conformance test's allowlist. The body
// is JSON-only: the wrapper refuses any other Content-Type, because a cross-site HTML form can
// send text/plain without a CORS preflight, so accepting it would allow login CSRF (signing a
// victim into the attacker's account).
export const POST = defineRoute({
  name: 'auth.login',
  auth: 'public',
  body: LoginBody,
  handler: async ({ request, requestId, body }) => {
    const result = await authenticate(body, {
      db,
      ip: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
      requestId,
      presentedSessionToken: readSessionToken(request),
    });

    switch (result.outcome) {
      case 'authenticated': {
        logEvent('auth.login.success', requestId);
        const response = NextResponse.json(
          {
            user: result.user,
            authStage: result.authStage,
            mustChangePassword: result.mustChangePassword,
          },
          { headers: { 'Cache-Control': 'no-store' } },
        );
        response.cookies.set(sessionCookie(result.session.token, result.session.expiresAt));
        response.cookies.set(csrfCookie(result.session.id, result.session.expiresAt));
        return response;
      }
      case 'invalid_credentials':
        logEvent('auth.login.failure', requestId);
        // The same status, code and text for every reason, so the body is byte-identical.
        return errorResponse(401, 'AUTH_INVALID_CREDENTIALS', 'Login lub hasło niepoprawne');
    }
  },
});
