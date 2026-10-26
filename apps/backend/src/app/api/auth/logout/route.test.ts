import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../../../../server/auth/cookie';
import {
  createSession,
  hashSessionToken,
  resolveSession,
  revokeSession,
} from '../../../../server/auth/session-service';
import { captureOutput } from '../../../../server/__fixtures__/capture-output';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { type AuthStage, sessions } from '../../../../server/db/schema';
import { csrfTokenForSession } from '../../../../server/security/csrf';
import { GET as me } from '../me/route';
import { POST, dynamic, runtime } from './route';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let userId: string;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  userId = insertUser(db, { login: 'employee1' });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const requestFor = (path: string, method: string, token?: string) => {
  const session = token
    ? db
        .select()
        .from(sessions)
        .where(eq(sessions.tokenHash, hashSessionToken(token)))
        .get()
    : undefined;
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(method === 'POST' ? { origin: 'http://localhost:3000' } : {}),
      ...(token === undefined ? {} : { cookie: `${sessionCookieName()}=${token}` }),
      ...(method === 'POST' && session ? { 'x-xsrf-token': csrfTokenForSession(session.id) } : {}),
    },
  });
};
const logout = (token?: string) => POST(requestFor('/api/auth/logout', 'POST', token));
const whoAmI = (token: string) => me(requestFor('/api/auth/me', 'GET', token));

const open = (stage: AuthStage = 'FULLY_AUTHENTICATED') => createSession(db, userId, stage);

describe('POST /api/auth/logout', () => {
  it('returns 204 with an empty body', async () => {
    const { token } = open();

    const response = await logout(token);

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('revokes the session in the database, so a copied cookie is dead (SEC-21)', async () => {
    const { token, session } = open();

    await logout(token);

    const row = db.select().from(sessions).where(eq(sessions.id, session.id)).get();
    expect(row?.revokedAt).toStrictEqual(T0);
    expect(row?.tokenHash).toBe(hashSessionToken(token));
    expect(resolveSession(db, token)).toBeNull();
  });

  it('makes the old token fail on /api/auth/me', async () => {
    const { token } = open();
    expect((await whoAmI(token)).status).toBe(200);

    await logout(token);

    const after = await whoAmI(token);
    expect(after.status).toBe(401);
    expect(await after.text()).toBe(NOT_SIGNED_IN);
  });

  it('clears the cookie in the browser: empty value, Max-Age=0, same HttpOnly/Secure/Lax/Path=/ attributes', async () => {
    const { token } = open();

    const response = await logout(token);

    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('__Host-sd_session=')) ?? '';
    const xsrfCookie = cookies.find((cookie) => cookie.startsWith('XSRF-TOKEN=')) ?? '';
    const attributes = sessionCookie.split(';').map((part) => part.trim().toLowerCase());
    expect(attributes[0]).toBe('__host-sd_session=');
    expect(attributes).toEqual(
      expect.arrayContaining(['max-age=0', 'httponly', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(attributes.some((a) => a.startsWith('domain'))).toBe(false);
    const xsrfAttributes = xsrfCookie.split(';').map((part) => part.trim().toLowerCase());
    expect(xsrfAttributes[0]).toBe('xsrf-token=');
    expect(xsrfAttributes).toEqual(
      expect.arrayContaining(['max-age=0', 'secure', 'samesite=lax', 'path=/']),
    );
    expect(xsrfAttributes).not.toContain('httponly');
  });

  it('ends only the caller’s session, not the same user’s other devices', async () => {
    const thisDevice = open();
    const otherDevice = open();

    await logout(thisDevice.token);

    expect(resolveSession(db, otherDevice.token)).not.toBeNull();
  });

  it.each<AuthStage>(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'])(
    'lets a %s session sign out, so a user who must change the password can still leave',
    async (stage) => {
      const { token } = open(stage);

      expect((await logout(token)).status).toBe(204);

      expect(resolveSession(db, token)).toBeNull();
    },
  );

  it.each([
    ['no cookie', undefined],
    ['a malformed token', 'not-a-token'],
    ['an unknown token', 'A'.repeat(43)],
  ])('answers 401 AUTH_REQUIRED, and sets no cookie, for %s', async (_, token) => {
    const response = await logout(token);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
    expect(response.headers.getSetCookie()).toHaveLength(0);
  });

  it('answers 401 AUTH_REQUIRED when the session is already revoked, so a second logout is not a silent success', async () => {
    const { token, session } = open();
    revokeSession(db, session.id);

    expect((await logout(token)).status).toBe(401);
  });

  it('writes no token to the log, only an event name and a request id', async () => {
    const { token } = open();
    const output = captureOutput();

    await logout(token);
    const lines = output.lines();
    output.restore();

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'auth.logout' });
    expect(Object.keys(JSON.parse(lines[0] ?? '') as object).sort()).toStrictEqual([
      'event',
      'requestId',
    ]);
    expect(lines.join('\n')).not.toContain(token);
  });
});

describe('route configuration', () => {
  it('runs on the Node.js runtime and is never cached or prerendered', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
