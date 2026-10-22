import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { ensureRole, insertUser } from '../db/__fixtures__/test-db';
import { setUpSharedTestDb } from '../db/__fixtures__/shared-test-db';
import { db } from '../db/client';
import { type AuthStage, sessions, users } from '../db/schema';
import { seedRbac } from '../db/seeds/rbac';
import { ApiError } from '../http/route';
import { PERMISSIONS } from '../permissions/codes';
import { sessionCookieName } from './cookie';
import { requireFullSession, requireSession, requireStage } from './guards';
import { createSession, revokeSession } from './session-service';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let userId: string;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db.transaction((tx) => seedRbac(tx));
  userId = insertUser(db);
});

afterEach(() => fakeClock.uninstall());

const open = (stage: AuthStage = 'FULLY_AUTHENTICATED', forUser: string = userId) =>
  createSession(db, forUser, stage);

const requestWith = (token?: string) =>
  new NextRequest('http://localhost:3000/api/anything', {
    headers: token === undefined ? {} : { cookie: `${sessionCookieName()}=${token}` },
  });

function refusal(action: () => unknown): ApiError {
  try {
    action();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the guard to refuse the request');
}

const lastActivity = (sessionId: string) =>
  db.select().from(sessions).where(eq(sessions.id, sessionId)).get()?.lastActivityAt;

describe('401 AUTH_REQUIRED: not signed in', () => {
  const expectNotSignedIn = (action: () => unknown) => {
    const error = refusal(action);
    expect([error.status, error.code, error.message]).toStrictEqual([
      401,
      'AUTH_REQUIRED',
      'Wymagane zalogowanie',
    ]);
  };

  it.each([
    ['has no cookie', () => requestWith()],
    ['carries a malformed token', () => requestWith('not-a-token')],
    ['carries a token that was never issued', () => requestWith('A'.repeat(43))],
    [
      'carries a revoked token',
      () => {
        const { token, session } = open();
        revokeSession(db, session.id);
        return requestWith(token);
      },
    ],
    [
      'carries the token of a session idle for 15 minutes',
      () => {
        const { token } = open();
        fakeClock.advance(15 * MINUTE_MS);
        return requestWith(token);
      },
    ],
    [
      'carries the token of a session older than 12 hours',
      () => {
        const { token, session } = open();
        fakeClock.advance(11 * HOUR_MS);
        db.update(sessions)
          .set({ lastActivityAt: fakeClock.now() })
          .where(eq(sessions.id, session.id))
          .run();
        fakeClock.advance(HOUR_MS);
        return requestWith(token);
      },
    ],
    [
      'carries the token of a blocked user',
      () => {
        const { token } = open();
        db.update(users).set({ isBlocked: true }).where(eq(users.id, userId)).run();
        return requestWith(token);
      },
    ],
  ])('every guard answers the same when the request %s', (_, makeRequest) => {
    const request = makeRequest();

    expectNotSignedIn(() => requireSession(request));
    expectNotSignedIn(() => requireFullSession(request));
    expectNotSignedIn(() => requireStage(request, ['PASSWORD_EXPIRED']));
  });
});

describe('a valid session', () => {
  it('is admitted by every guard that allows its stage, with the user and permissions', () => {
    const { token, session } = open();

    for (const guard of [requireSession, requireFullSession]) {
      const resolved = guard(requestWith(token));
      expect(resolved.session.id).toBe(session.id);
      expect(resolved.user.id).toBe(userId);
      expect(resolved.permissions).toContain(PERMISSIONS.TICKETS_CREATE);
    }
    expect(requireStage(requestWith(token), ['FULLY_AUTHENTICATED']).user.id).toBe(userId);
  });

  it('counts as activity: the idle clock restarts when the request is admitted', () => {
    const { token, session } = open();
    fakeClock.advance(10 * MINUTE_MS);

    requireFullSession(requestWith(token));

    expect(lastActivity(session.id)).toStrictEqual(new Date(T0.getTime() + 10 * MINUTE_MS));
  });

  it('stays alive while it is used regularly, until the 12-hour limit ends it regardless', () => {
    const { token } = open();

    for (let elapsed = 10; elapsed < 12 * 60; elapsed += 10) {
      fakeClock.set(new Date(T0.getTime() + elapsed * MINUTE_MS));
      expect(() => requireFullSession(requestWith(token)), `at +${elapsed} min`).not.toThrow();
    }

    fakeClock.set(new Date(T0.getTime() + 12 * HOUR_MS));
    expect(refusal(() => requireFullSession(requestWith(token))).code).toBe('AUTH_REQUIRED');
  });
});

describe('403 AUTH_PASSWORD_CHANGE_REQUIRED: a password change is still owed', () => {
  it.each<AuthStage>(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'])(
    'keeps a %s session out of endpoints that need a fully authenticated one',
    (stage) => {
      const { token } = open(stage);

      const error = refusal(() => requireFullSession(requestWith(token)));

      expect([error.status, error.code, error.message]).toStrictEqual([
        403,
        'AUTH_PASSWORD_CHANGE_REQUIRED',
        'Wymagana zmiana hasła',
      ]);
    },
  );

  it.each<AuthStage>(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'])(
    'still lets a %s session through the endpoints open to every stage (me, logout)',
    (stage) => {
      const { token } = open(stage);

      expect(requireSession(requestWith(token)).session.authStage).toBe(stage);
    },
  );

  it('lets each restricted stage use only the endpoint made for it', () => {
    const initial = open('INITIAL_PASSWORD_CHANGE');
    const expired = open('PASSWORD_EXPIRED');

    expect(() =>
      requireStage(requestWith(initial.token), ['INITIAL_PASSWORD_CHANGE']),
    ).not.toThrow();
    expect(
      refusal(() => requireStage(requestWith(expired.token), ['INITIAL_PASSWORD_CHANGE'])).code,
    ).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
    expect(() => requireStage(requestWith(expired.token), ['PASSWORD_EXPIRED'])).not.toThrow();
  });

  it('answers AUTH_FORBIDDEN, not "change your password", when a fully authenticated session calls a restricted-stage endpoint', () => {
    const { token } = open('FULLY_AUTHENTICATED');

    const error = refusal(() => requireStage(requestWith(token), ['INITIAL_PASSWORD_CHANGE']));

    expect([error.status, error.code, error.message]).toStrictEqual([
      403,
      'AUTH_FORBIDDEN',
      'Brak uprawnień',
    ]);
  });
});

describe('403 AUTH_FORBIDDEN: the role does not grant the permission', () => {
  it('admits a role that has the permission', () => {
    const { token } = open();

    expect(() =>
      requireFullSession(requestWith(token), { permission: PERMISSIONS.TICKETS_CREATE }),
    ).not.toThrow();
  });

  it('refuses a role that lacks it', () => {
    const { token } = open();

    const error = refusal(() =>
      requireFullSession(requestWith(token), { permission: PERMISSIONS.USERS_CREATE }),
    );

    expect([error.status, error.code]).toStrictEqual([403, 'AUTH_FORBIDDEN']);
  });

  it('refuses a role that has no permissions at all', () => {
    const memberId = insertUser(db, { login: 'member1', roleId: ensureRole(db, 'no-permissions') });
    const { token } = open('FULLY_AUTHENTICATED', memberId);

    const error = refusal(() =>
      requireFullSession(requestWith(token), { permission: PERMISSIONS.TICKETS_CREATE }),
    );

    expect(error.code).toBe('AUTH_FORBIDDEN');
  });

  it('reports a pending password change before a missing permission', () => {
    const { token } = open('INITIAL_PASSWORD_CHANGE');

    const error = refusal(() =>
      requireFullSession(requestWith(token), { permission: PERMISSIONS.USERS_CREATE }),
    );

    expect(error.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');
  });
});

describe('a refused request never extends a session', () => {
  // If refusals counted as activity, anyone holding an old cookie could keep a session alive
  // forever by hammering an endpoint they are not allowed to use.
  it.each([
    [
      'wrong stage',
      (token: string) => requireFullSession(requestWith(token)),
      'INITIAL_PASSWORD_CHANGE' as const,
    ],
    [
      'missing permission',
      (token: string) =>
        requireFullSession(requestWith(token), { permission: PERMISSIONS.USERS_CREATE }),
      'FULLY_AUTHENTICATED' as const,
    ],
  ])('(%s): last activity stays put and the idle timeout still fires', (_, attempt, stage) => {
    const { token, session } = open(stage);
    fakeClock.advance(10 * MINUTE_MS);

    expect(() => attempt(token)).toThrow(ApiError);
    expect(lastActivity(session.id)).toStrictEqual(T0);

    // 16 minutes after the last real activity, only 6 after the refused request.
    fakeClock.advance(6 * MINUTE_MS);
    expect(refusal(() => requireSession(requestWith(token))).code).toBe('AUTH_REQUIRED');
  });

  it('does not touch the stored session when the token is unknown', () => {
    const { session } = open();

    expect(() => requireSession(requestWith('A'.repeat(43)))).toThrow(ApiError);

    expect(lastActivity(session.id)).toStrictEqual(T0);
  });
});
