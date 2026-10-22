import type { NextRequest } from 'next/server';

// Secure unless COOKIE_SECURE is explicitly "false" (plain-HTTP local development), so a missing
// or mistyped variable in a deployment fails safe instead of sending the session cookie in clear.
function secureCookies(): boolean {
  return process.env.COOKIE_SECURE !== 'false';
}

/** The `__Host-` prefix makes browsers insist on Secure, Path=/ and no Domain, so it needs HTTPS. */
export function sessionCookieName(): string {
  return secureCookies() ? '__Host-sd_session' : 'sd_session';
}

// HttpOnly keeps the token away from page scripts. SameSite=Lax withholds the cookie from
// cross-site POSTs. There is deliberately no Domain attribute: the cookie is host-only.
function attributes() {
  return { httpOnly: true, secure: secureCookies(), sameSite: 'lax' as const, path: '/' };
}

/** The cookie that carries a new session. It expires with the session's absolute lifetime. */
export function sessionCookie(token: string, expiresAt: Date) {
  return { name: sessionCookieName(), value: token, ...attributes(), expires: expiresAt };
}

/** Tells the browser to drop the session cookie (Max-Age=0). */
export function clearedSessionCookie() {
  return { name: sessionCookieName(), value: '', ...attributes(), maxAge: 0 };
}

/** The raw session token the request carried, if any. It is untrusted until resolved. */
export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(sessionCookieName())?.value;
}
