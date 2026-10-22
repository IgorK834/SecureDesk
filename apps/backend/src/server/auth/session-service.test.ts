import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { sessions } from '../db/schema';
import { setClockForTests } from '../time/clock';
import {
  SESSION_LIFETIME_MS,
  createSession,
  hashSessionToken,
  sessionCookie,
  sessionCookieName,
} from './session-service';

const NOW = new Date('2026-03-10T12:00:00.000Z');

let db: AppDb;
let userId: string;

beforeEach(() => {
  db = createMigratedDb();
  userId = insertUser(db);
  setClockForTests({ now: () => NOW });
});

afterEach(() => {
  setClockForTests();
  vi.unstubAllEnvs();
});

function allSessions() {
  return db.select().from(sessions).all();
}

describe('createSession', () => {
  it('stores only a digest of the token, so a copy of the database cannot be replayed as a cookie', () => {
    const { token } = createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED' });

    const [row] = allSessions();
    expect(row?.tokenHash).toBe(hashSessionToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('issues an unguessable, never repeated token: 256 bits, URL-safe', () => {
    const tokens = Array.from(
      { length: 50 },
      () => createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED' }).token,
    );

    expect(new Set(tokens).size).toBe(50);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });

  it('records the stage that restricts what the session may do, and an absolute expiry', () => {
    const { expiresAt } = createSession(db, { userId, authStage: 'INITIAL_PASSWORD_CHANGE' });

    const [row] = allSessions();
    expect(row).toMatchObject({
      userId,
      authStage: 'INITIAL_PASSWORD_CHANGE',
      createdAt: NOW,
      lastActivityAt: NOW,
      revokedAt: null,
    });
    expect(expiresAt).toStrictEqual(new Date(NOW.getTime() + SESSION_LIFETIME_MS));
    expect(row?.expiresAt).toStrictEqual(expiresAt);
  });

  it('revokes the session the request carried, so a token planted before login is dead afterwards', () => {
    const planted = createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED' });

    const fresh = createSession(db, {
      userId,
      authStage: 'FULLY_AUTHENTICATED',
      replacesToken: planted.token,
    });

    const byDigest = new Map(allSessions().map((row) => [row.tokenHash, row]));
    expect(fresh.token).not.toBe(planted.token);
    expect(byDigest.get(hashSessionToken(planted.token))?.revokedAt).toStrictEqual(NOW);
    expect(byDigest.get(hashSessionToken(fresh.token))?.revokedAt).toBeNull();
  });

  it('keeps the original revocation time of a session that was already revoked', () => {
    const old = createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED' });
    const revokedAt = new Date('2026-03-01T00:00:00.000Z');
    db.update(sessions).set({ revokedAt }).run();

    createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED', replacesToken: old.token });

    const row = allSessions().find((r) => r.tokenHash === hashSessionToken(old.token));
    expect(row?.revokedAt).toStrictEqual(revokedAt);
  });

  it('ignores a token that matches no session', () => {
    const { token } = createSession(db, {
      userId,
      authStage: 'FULLY_AUTHENTICATED',
      replacesToken: 'not-a-real-token',
    });

    expect(allSessions()).toHaveLength(1);
    expect(allSessions()[0]?.tokenHash).toBe(hashSessionToken(token));
  });

  it('is all-or-nothing: if the new session cannot be stored, the old one is not revoked', () => {
    const old = createSession(db, { userId, authStage: 'FULLY_AUTHENTICATED' });

    expect(() =>
      createSession(db, {
        userId: 'no-such-user', // violates the foreign key, so the insert fails
        authStage: 'FULLY_AUTHENTICATED',
        replacesToken: old.token,
      }),
    ).toThrow();

    expect(allSessions()).toHaveLength(1);
    expect(allSessions()[0]?.revokedAt).toBeNull();
  });
});

describe('hashSessionToken', () => {
  it('is a stable SHA-256 hex digest', () => {
    expect(hashSessionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('sessionCookie', () => {
  const expiresAt = new Date('2026-03-10T20:00:00.000Z');

  it('is HttpOnly, Secure, SameSite=Lax, host-only and site-wide by default', () => {
    expect(sessionCookie('tok', expiresAt)).toStrictEqual({
      name: '__Host-securedesk_session',
      value: 'tok',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  });

  it('never sets a Domain, which would let subdomains read or overwrite the cookie', () => {
    expect(sessionCookie('tok', expiresAt)).not.toHaveProperty('domain');
  });

  it('drops Secure and the __Host- prefix (which requires HTTPS) only when COOKIE_SECURE=false', () => {
    vi.stubEnv('COOKIE_SECURE', 'false');

    expect(sessionCookieName()).toBe('securedesk_session');
    expect(sessionCookie('tok', expiresAt)).toMatchObject({ secure: false, httpOnly: true });
  });

  it.each(['true', '', 'no', 'FALSE'])(
    'stays Secure for COOKIE_SECURE=%j, so a typo cannot silently weaken the cookie',
    (value) => {
      vi.stubEnv('COOKIE_SECURE', value);

      expect(sessionCookie('tok', expiresAt).secure).toBe(true);
      expect(sessionCookieName()).toBe('__Host-securedesk_session');
    },
  );
});
