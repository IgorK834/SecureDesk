import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { SessionInfo } from '../auth/session-service';
import { secureCookies } from '../auth/cookie';
import { ApiError } from '../http/errors';

export const XSRF_COOKIE_NAME = 'XSRF-TOKEN';
export const XSRF_HEADER_NAME = 'X-XSRF-TOKEN';

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const configuredSecret = (): string => {
  const secret = process.env.CSRF_SECRET;
  if (!secret) throw new Error('CSRF_SECRET is not configured');
  return secret;
};

const configuredOrigin = (): string => {
  const value = process.env.APP_ORIGIN;
  if (!value) throw new Error('APP_ORIGIN is not configured');
  return new URL(value).origin;
};

const requestOrigin = (request: NextRequest): string | null => {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const referer = request.headers.get('referer');
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
};

const originMismatch = () =>
  new ApiError(403, 'CSRF_ORIGIN_MISMATCH', 'Nieprawidłowe źródło żądania');
const invalidToken = () => new ApiError(403, 'CSRF_TOKEN_INVALID', 'Nieprawidłowy token CSRF');

/** A stateless token bound to one server-side session. */
export function csrfTokenForSession(sessionId: string): string {
  return createHmac('sha256', configuredSecret()).update(sessionId).digest('base64url');
}

/** Non-HttpOnly by design: Angular reads this cookie and echoes it in the XSRF header. */
export function csrfCookie(sessionId: string, expiresAt: Date) {
  return {
    name: XSRF_COOKIE_NAME,
    value: csrfTokenForSession(sessionId),
    httpOnly: false,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    expires: expiresAt,
  };
}

export function clearedCsrfCookie() {
  return {
    name: XSRF_COOKIE_NAME,
    value: '',
    httpOnly: false,
    secure: secureCookies(),
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  };
}

/**
 * Checks every state-changing request. Public login has no session yet, so it receives the same
 * strict Origin check but no token check; its JSON-only body forces a browser preflight too.
 */
export function assertCsrfProtection(request: NextRequest, session?: SessionInfo): void {
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return;
  if (requestOrigin(request) !== configuredOrigin()) throw originMismatch();
  if (!session) return;

  const supplied = request.headers.get(XSRF_HEADER_NAME);
  if (!supplied) throw invalidToken();
  const expected = Buffer.from(csrfTokenForSession(session.id));
  const candidate = Buffer.from(supplied);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    throw invalidToken();
  }
}
