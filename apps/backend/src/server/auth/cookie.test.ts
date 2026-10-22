import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearedSessionCookie, readSessionToken, sessionCookie, sessionCookieName } from './cookie';

afterEach(() => vi.unstubAllEnvs());

const EXPIRES = new Date('2030-01-01T12:00:00.000Z');
const TOKEN = 'A'.repeat(43);

/** The Set-Cookie header Next.js would send for this cookie, split into lower-cased attributes. */
function attributesOf(
  cookie: ReturnType<typeof sessionCookie> | ReturnType<typeof clearedSessionCookie>,
): string[] {
  const response = new NextResponse(null);
  response.cookies.set(cookie);
  return (response.headers.get('set-cookie') ?? '')
    .split(';')
    .map((part) => part.trim().toLowerCase());
}

describe('session cookie over HTTPS (the default)', () => {
  it('uses the __Host- name, which makes the browser insist on Secure, Path=/ and no Domain', () => {
    expect(sessionCookieName()).toBe('__Host-sd_session');
  });

  it('is HttpOnly, Secure, SameSite=Lax, Path=/ and host-only, and lasts until the session ends', () => {
    const attributes = attributesOf(sessionCookie(TOKEN, EXPIRES));

    expect(attributes[0]).toBe(`__host-sd_session=${TOKEN.toLowerCase()}`);
    expect(attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(attributes.some((a) => a.startsWith('domain'))).toBe(false);
    expect(attributes).toContain(`expires=${EXPIRES.toUTCString().toLowerCase()}`);
  });

  it('is cleared with Max-Age=0 and the same attributes, so the browser really replaces it', () => {
    const attributes = attributesOf(clearedSessionCookie());

    expect(attributes[0]).toBe('__host-sd_session=');
    expect(attributes).toEqual(
      expect.arrayContaining(['max-age=0', 'httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(attributes.some((a) => a.startsWith('domain'))).toBe(false);
  });
});

describe('Secure is only dropped when COOKIE_SECURE is exactly "false"', () => {
  it('switches to the plain name without Secure for local HTTP development', () => {
    vi.stubEnv('COOKIE_SECURE', 'false');

    const attributes = attributesOf(sessionCookie(TOKEN, EXPIRES));

    expect(sessionCookieName()).toBe('sd_session');
    expect(attributes[0]).toBe(`sd_session=${TOKEN.toLowerCase()}`);
    expect(attributes).not.toContain('secure');
    expect(attributes).toEqual(expect.arrayContaining(['httponly', 'samesite=lax', 'path=/']));
  });

  // A deployment that forgets or mistypes the variable must fail safe, not send the session
  // cookie over plain HTTP.
  it.each(['true', '', 'False', 'FALSE', 'no', '0', ' false'])(
    'stays Secure when COOKIE_SECURE is %j',
    (value) => {
      vi.stubEnv('COOKIE_SECURE', value);

      expect(sessionCookieName()).toBe('__Host-sd_session');
      expect(attributesOf(sessionCookie(TOKEN, EXPIRES))).toContain('secure');
    },
  );
});

describe('readSessionToken', () => {
  const requestWith = (cookie?: string) =>
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: cookie === undefined ? {} : { cookie },
    });

  it('returns the value of the session cookie', () => {
    expect(readSessionToken(requestWith(`other=1; __Host-sd_session=${TOKEN}; more=2`))).toBe(
      TOKEN,
    );
  });

  it('returns undefined when there is no cookie or no session cookie', () => {
    expect(readSessionToken(requestWith())).toBeUndefined();
    expect(readSessionToken(requestWith('other=1'))).toBeUndefined();
  });

  // The point of the __Host- prefix: a sibling subdomain can set a plain `sd_session` cookie for
  // the whole site, but cannot set a __Host- one. Over HTTPS only the latter may be trusted.
  it('ignores the plain-named cookie when running over HTTPS', () => {
    expect(readSessionToken(requestWith(`sd_session=${TOKEN}`))).toBeUndefined();
  });

  it('reads the plain-named cookie in HTTP development mode, and only that one', () => {
    vi.stubEnv('COOKIE_SECURE', 'false');

    expect(readSessionToken(requestWith(`sd_session=${TOKEN}`))).toBe(TOKEN);
    expect(readSessionToken(requestWith(`__Host-sd_session=${TOKEN}`))).toBeUndefined();
  });
});
