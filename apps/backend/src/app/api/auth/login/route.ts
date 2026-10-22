import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken, sessionCookie } from '../../../../server/auth/cookie';
import { authenticate } from '../../../../server/auth/login-service';
import { db } from '../../../../server/db/client';
import { errorResponse, handleRoute } from '../../../../server/http/route';
import { logEvent } from '../../../../server/security/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LoginBody = z
  .object({
    login: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(1024), // never trim or normalize the password
  })
  .strict();

// The client address is only known through a proxy header, which is trustworthy only when a
// proxy we control sets it (TRUST_PROXY=true). Task 6.1 may refine this.
function clientKeyOf(request: NextRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwardedFor) return forwardedFor;
  }
  return 'unknown';
}

export const POST = handleRoute('auth.login', async (request, requestId) => {
  // Only application/json is read. A cross-site HTML form can send text/plain without a CORS
  // preflight, so accepting it would allow login CSRF (signing a victim into the attacker's
  // account). Anything else, or a body that is not valid JSON, is validated as `undefined`,
  // which the schema rejects.
  const mediaType = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  const body: unknown =
    mediaType === 'application/json' ? await request.json().catch(() => undefined) : undefined;
  const parsed = LoginBody.safeParse(body);
  if (!parsed.success) {
    logEvent('auth.login.invalid_request', requestId);
    return errorResponse(400, 'VALIDATION_ERROR', 'Nieprawidłowe dane żądania');
  }

  const result = await authenticate(parsed.data, {
    db,
    clientKey: clientKeyOf(request),
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
      return response;
    }
    case 'rate_limited':
      logEvent('auth.login.rate_limited', requestId);
      return errorResponse(
        429,
        'AUTH_RATE_LIMITED',
        'Zbyt wiele prób logowania. Spróbuj ponownie później',
        { 'Retry-After': String(result.retryAfterSeconds) },
      );
    case 'invalid_credentials':
      logEvent('auth.login.failure', requestId);
      // The same status, code and text for every reason, so the body is byte-identical.
      return errorResponse(401, 'AUTH_INVALID_CREDENTIALS', 'Login lub hasło niepoprawne');
  }
});
