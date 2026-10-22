import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../../../../server/auth/cookie';
import { createSession, revokeSession } from '../../../../server/auth/session-service';
import { captureOutput } from '../../../../server/__fixtures__/capture-output';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { type AuthStage, sessions, users } from '../../../../server/db/schema';
import { seedRbac } from '../../../../server/db/seeds/rbac';
import { ROLES } from '../../../../server/permissions/codes';
import { ROLE_PERMISSIONS } from '../../../../server/permissions/matrix';
import { GET, dynamic, runtime } from './route';

const MINUTE_MS = 60 * 1000;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let userId: string;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db.transaction((tx) => seedRbac(tx));
  userId = insertUser(db, { login: 'employee1', firstName: 'Jan', lastName: 'Kowalski' });
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const me = (token?: string) =>
  GET(
    new NextRequest('http://localhost:3000/api/auth/me', {
      headers: token === undefined ? {} : { cookie: `${sessionCookieName()}=${token}` },
    }),
  );

const open = (stage: AuthStage = 'FULLY_AUTHENTICATED') => createSession(db, userId, stage);

describe('GET /api/auth/me: signed in', () => {
  it('returns the profile, the stage, the password-change flag and the role’s permissions', async () => {
    const { token } = open();

    const response = await me(token);

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const body = (await response.json()) as { permissions: string[] };
    expect({ ...body, permissions: [...body.permissions].sort() }).toStrictEqual({
      user: {
        id: userId,
        login: 'employee1',
        firstName: 'Jan',
        lastName: 'Kowalski',
        role: 'EMPLOYEE',
      },
      authStage: 'FULLY_AUTHENTICATED',
      mustChangePassword: false,
      permissions: [...ROLE_PERMISSIONS[ROLES.EMPLOYEE]].sort(),
    });
  });

  it('never exposes a hash, a token or another internal field', async () => {
    const { token } = open();

    const text = await (await me(token)).text();

    expect(text).not.toMatch(/hash|token|argon2|deleted|isBlocked|loginNormalized|\$/i);
    expect(text).not.toContain(token);
  });

  // The client must be able to find out that a password change is owed; a restricted session that
  // received a bare 403 here could not tell why it cannot do anything.
  it.each<[AuthStage, boolean]>([
    ['INITIAL_PASSWORD_CHANGE', true],
    ['PASSWORD_EXPIRED', false],
  ])('answers a %s session instead of refusing it', async (stage, mustChangePassword) => {
    const { token } = open(stage);
    db.update(users).set({ mustChangePassword }).run();

    const response = await me(token);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ authStage: stage, mustChangePassword });
  });

  it('counts as activity and so keeps an idle session alive', async () => {
    const { token, session } = open();
    fakeClock.advance(10 * MINUTE_MS);

    await me(token);

    const row = db.select().from(sessions).where(eq(sessions.id, session.id)).get();
    expect(row?.lastActivityAt).toStrictEqual(new Date(T0.getTime() + 10 * MINUTE_MS));
  });
});

describe('GET /api/auth/me: not signed in', () => {
  const expectNotSignedIn = async (response: Response) => {
    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  };

  it('answers 401 AUTH_REQUIRED without a cookie', async () => {
    await expectNotSignedIn(await me());
  });

  it('answers 401 AUTH_REQUIRED for a malformed token', async () => {
    await expectNotSignedIn(await me('not-a-token'));
  });

  it('answers 401 AUTH_REQUIRED for a well-formed token that was never issued', async () => {
    await expectNotSignedIn(await me('A'.repeat(43)));
  });

  it('answers 401 AUTH_REQUIRED for a revoked token', async () => {
    const { token, session } = open();
    revokeSession(db, session.id);

    await expectNotSignedIn(await me(token));
  });

  it('answers 401 AUTH_REQUIRED after 15 minutes of inactivity (SEC-22)', async () => {
    const { token } = open();
    fakeClock.advance(15 * MINUTE_MS);

    await expectNotSignedIn(await me(token));
  });

  it('gives every one of these refusals a byte-identical response, so the reason is not revealed', async () => {
    const revoked = open();
    revokeSession(db, revoked.session.id);

    const texts = await Promise.all(
      [undefined, 'not-a-token', 'A'.repeat(43), revoked.token].map(async (token) =>
        (await me(token)).text(),
      ),
    );

    expect(new Set(texts)).toStrictEqual(new Set([NOT_SIGNED_IN]));
  });
});

describe('GET /api/auth/me: logging', () => {
  it('writes no token to the log, and only an event name and a request id on a refusal', async () => {
    const { token } = open();
    const output = captureOutput();

    await me(token);
    await me('A'.repeat(43));
    const lines = output.lines();
    output.restore();

    expect(lines.join('\n')).not.toContain(token);
    for (const line of lines) {
      expect(Object.keys(JSON.parse(line) as object).sort()).toStrictEqual(['event', 'requestId']);
    }
  });
});

describe('route configuration', () => {
  it('runs on the Node.js runtime and is never cached or prerendered', () => {
    expect(runtime).toBe('nodejs');
    expect(dynamic).toBe('force-dynamic');
  });
});
