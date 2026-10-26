import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import type { SessionInfo } from '../auth/session-service';
import {
  assertCsrfProtection,
  clearedCsrfCookie,
  csrfCookie,
  csrfTokenForSession,
  XSRF_HEADER_NAME,
} from './csrf';

const SESSION: SessionInfo = {
  id: 'session-one',
  userId: 'user-one',
  authStage: 'FULLY_AUTHENTICATED',
  createdAt: new Date('2030-01-01T00:00:00Z'),
  lastActivityAt: new Date('2030-01-01T00:00:00Z'),
  expiresAt: new Date('2030-01-01T12:00:00Z'),
};
const ORIGIN = 'http://localhost:3000';

const request = (method: string, headers: Record<string, string> = {}) =>
  new NextRequest(`${ORIGIN}/api/test`, { method, headers });

describe('CSRF session binding (SEC-24)', () => {
  it('produces a stable base64url HMAC that differs for another session', () => {
    const token = csrfTokenForSession(SESSION.id);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(csrfTokenForSession(SESSION.id)).toBe(token);
    expect(csrfTokenForSession('session-two')).not.toBe(token);
  });

  it('accepts the configured Origin and a matching token', () => {
    expect(() =>
      assertCsrfProtection(
        request('POST', {
          origin: ORIGIN,
          [XSRF_HEADER_NAME]: csrfTokenForSession(SESSION.id),
        }),
        SESSION,
      ),
    ).not.toThrow();
  });

  it('accepts a same-origin Referer only as the Origin fallback', () => {
    expect(() =>
      assertCsrfProtection(
        request('DELETE', {
          referer: `${ORIGIN}/account/change-password`,
          [XSRF_HEADER_NAME]: csrfTokenForSession(SESSION.id),
        }),
        SESSION,
      ),
    ).not.toThrow();
  });

  it.each([
    ['a foreign Origin', { origin: 'https://evil.example' }, 'CSRF_ORIGIN_MISMATCH'],
    ['a missing Origin and Referer', {}, 'CSRF_ORIGIN_MISMATCH'],
    ['a malformed Referer', { referer: 'not a url' }, 'CSRF_ORIGIN_MISMATCH'],
  ])('rejects %s', (_, headers, code) => {
    expect(() => assertCsrfProtection(request('POST', headers), SESSION)).toThrowError(
      expect.objectContaining({ status: 403, code }),
    );
  });

  it.each([
    ['a missing token', {}],
    ['a different same-length token', { [XSRF_HEADER_NAME]: 'A'.repeat(43) }],
    ['a token with the wrong length', { [XSRF_HEADER_NAME]: 'short' }],
  ])('rejects %s', (_, tokenHeader) => {
    expect(() =>
      assertCsrfProtection(request('PATCH', { origin: ORIGIN, ...tokenHeader }), SESSION),
    ).toThrowError(expect.objectContaining({ status: 403, code: 'CSRF_TOKEN_INVALID' }));
  });

  it('requires only the Origin for a public state-changing route such as login', () => {
    expect(() => assertCsrfProtection(request('POST', { origin: ORIGIN }))).not.toThrow();
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not apply to %s', (method) => {
    expect(() => assertCsrfProtection(request(method), SESSION)).not.toThrow();
  });
});

describe('XSRF cookie', () => {
  it('is readable by Angular but remains Secure, SameSite=Lax and scoped to the host path', () => {
    expect(csrfCookie(SESSION.id, SESSION.expiresAt)).toStrictEqual({
      name: 'XSRF-TOKEN',
      value: csrfTokenForSession(SESSION.id),
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: SESSION.expiresAt,
    });
  });

  it('clears the browser value on logout', () => {
    expect(clearedCsrfCookie()).toMatchObject({
      name: 'XSRF-TOKEN',
      value: '',
      httpOnly: false,
      maxAge: 0,
    });
  });

  it('uses the non-Secure cookie setting only when explicitly configured for local development', () => {
    vi.stubEnv('COOKIE_SECURE', 'false');
    expect(csrfCookie(SESSION.id, SESSION.expiresAt).secure).toBe(false);
  });
});
