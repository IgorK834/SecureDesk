import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { type AppDb, createDb } from '../db/connection';
import { createMigratedDb, ensureRole, insertUser } from '../db/__fixtures__/test-db';
import { runMigrations } from '../db/migrate';
import { securitySettings, sessions, users } from '../db/schema';
import { seedRbac } from '../db/seeds/rbac';
import { ROLES } from '../permissions/codes';
import { ROLE_PERMISSIONS } from '../permissions/matrix';
import {
  SESSION_ABSOLUTE_LIFETIME_MS,
  createSession,
  hashSessionToken,
  resolveSession,
  revokeAllForUser,
  revokeSession,
  revokeSessionByToken,
  rotateSession,
  touchSession,
} from './session-service';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');

const fakeClock = new FakeClock(T0);
let db: AppDb;
let userId: string;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db = createMigratedDb();
  userId = insertUser(db);
});

afterEach(() => {
  db.$client.close();
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const rowFor = (token: string) =>
  db
    .select()
    .from(sessions)
    .all()
    .find((row) => row.tokenHash === hashSessionToken(token));

const open = (stage: Parameters<typeof createSession>[2] = 'FULLY_AUTHENTICATED') =>
  createSession(db, userId, stage);

const setIdleTimeoutMinutes = (minutes: number) => {
  db.insert(securitySettings)
    .values({ id: 1, sessionIdleTimeoutMinutes: minutes })
    .onConflictDoUpdate({
      target: securitySettings.id,
      set: { sessionIdleTimeoutMinutes: minutes },
    })
    .run();
};

describe('hashSessionToken', () => {
  it('is the lowercase hex SHA-256 of the token', () => {
    // The standard SHA-256 test vector for "abc".
    expect(hashSessionToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});

describe('createSession', () => {
  it('issues a 256-bit URL-safe token that differs every time', () => {
    const tokens = Array.from({ length: 200 }, () => open().token);

    expect(tokens.every((token) => /^[A-Za-z0-9_-]{43}$/.test(token))).toBe(true);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('stores only the SHA-256 digest of the token, never the token', () => {
    const { token, session } = open();

    const stored = db.select().from(sessions).all();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.tokenHash).toBe(hashSessionToken(token));
    expect(stored[0]?.id).toBe(session.id);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('starts the idle clock and the 12-hour absolute lifetime now, in the requested stage', () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');

    expect(session).toStrictEqual({
      id: expect.any(String),
      userId,
      authStage: 'INITIAL_PASSWORD_CHANGE',
      createdAt: T0,
      lastActivityAt: T0,
      expiresAt: new Date(T0.getTime() + 12 * HOUR_MS),
    });
    expect(SESSION_ABSOLUTE_LIFETIME_MS).toBe(12 * HOUR_MS);
  });

  it('never hands out the stored digest or a revocation marker', () => {
    expect(Object.keys(open().session).sort()).toStrictEqual([
      'authStage',
      'createdAt',
      'expiresAt',
      'id',
      'lastActivityAt',
      'userId',
    ]);
  });
});

describe('resolveSession: who the token belongs to', () => {
  it('returns the session, the user without any secret, and the permissions of the role', () => {
    db.transaction((tx) => seedRbac(tx));
    const { token, session } = open();

    const resolved = resolveSession(db, token);

    expect(resolved?.session).toStrictEqual(session);
    expect(resolved?.user).toMatchObject({
      id: userId,
      login: 'employee1',
      roleId: ROLES.EMPLOYEE,
    });
    expect(Object.keys(resolved?.user ?? {}).sort()).toStrictEqual([
      'createdAt',
      'firstName',
      'id',
      'isBlocked',
      'lastName',
      'login',
      'mustChangePassword',
      'roleId',
      'totpEnabled',
      'updatedAt',
    ]);
    expect([...(resolved?.permissions ?? [])].sort()).toStrictEqual(
      [...ROLE_PERMISSIONS[ROLES.EMPLOYEE]].sort(),
    );
  });

  // No seeded role is empty, but the permission lookup is a LEFT JOIN so that a role someone
  // creates without permissions yields an empty list instead of making the session vanish.
  it('gives a role without any permission an empty list, not a missing session', () => {
    db.transaction((tx) => seedRbac(tx));
    const roleId = ensureRole(db, 'no-permissions');
    const memberId = insertUser(db, { login: 'member1', roleId });
    const { token } = createSession(db, memberId, 'FULLY_AUTHENTICATED');

    const resolved = resolveSession(db, token);

    expect(resolved?.user.id).toBe(memberId);
    expect(resolved?.permissions).toStrictEqual([]);
  });

  it('does not count as activity: only touchSession moves the idle clock', () => {
    const { token } = open();
    fakeClock.advance(5 * MINUTE_MS);

    resolveSession(db, token);

    expect(rowFor(token)?.lastActivityAt).toStrictEqual(T0);
  });
});

describe('resolveSession: tokens that were never issued', () => {
  it('treats a missing token, an unknown token and a revoked token the same: not signed in', () => {
    const { token, session } = open();
    revokeSession(db, session.id);

    expect(resolveSession(db, undefined)).toBeNull();
    expect(resolveSession(db, 'A'.repeat(43))).toBeNull();
    expect(resolveSession(db, token)).toBeNull();
  });

  it.each([
    ['empty', ''],
    ['one character short', 'A'.repeat(42)],
    ['one character long', 'A'.repeat(44)],
    ['padded like standard base64', `${'A'.repeat(42)}=`],
    ['standard base64 alphabet', `${'A'.repeat(41)}+/`],
    ['containing a space', `${'A'.repeat(42)} `],
    ['ending in a newline', `${'A'.repeat(43)}\n`],
    ['an injection attempt', "' OR '1'='1"],
  ])('rejects a malformed token (%s) without touching the database', (_, token) => {
    const select = vi.spyOn(db, 'select');

    expect(resolveSession(db, token)).toBeNull();
    expect(select).not.toHaveBeenCalled();
  });
});

describe('resolveSession: revocation', () => {
  it('stops accepting a session the moment it is revoked', () => {
    const { token, session } = open();
    expect(resolveSession(db, token)).not.toBeNull();

    revokeSession(db, session.id);

    expect(resolveSession(db, token)).toBeNull();
  });

  it('keeps the first revocation time when a session is revoked again', () => {
    const { token, session } = open();
    revokeSession(db, session.id);
    fakeClock.advance(HOUR_MS);

    revokeSession(db, session.id);

    expect(rowFor(token)?.revokedAt).toStrictEqual(T0);
  });
});

describe('resolveSession: inactivity timeout (SEC-22)', () => {
  it('accepts a request 1 ms before the timeout and rejects one exactly at it', () => {
    const { token } = open();

    fakeClock.set(new Date(T0.getTime() + 15 * MINUTE_MS - 1));
    expect(resolveSession(db, token)).not.toBeNull();

    fakeClock.set(new Date(T0.getTime() + 15 * MINUTE_MS));
    expect(resolveSession(db, token)).toBeNull();
  });

  it('revokes an idle session on the spot, so raising the timeout later cannot revive it', () => {
    const { token } = open();
    fakeClock.advance(15 * MINUTE_MS);

    expect(resolveSession(db, token)).toBeNull();
    expect(rowFor(token)?.revokedAt).toStrictEqual(new Date(T0.getTime() + 15 * MINUTE_MS));

    setIdleTimeoutMinutes(120);
    expect(resolveSession(db, token)).toBeNull();
  });

  it('measures inactivity from the last recorded activity, not from login', () => {
    const { token, session } = open();
    fakeClock.advance(10 * MINUTE_MS);
    touchSession(db, session.id);

    fakeClock.advance(14 * MINUTE_MS + 59_999); // 24 min 59.999 s after login, 1 ms short of idle
    expect(resolveSession(db, token)).not.toBeNull();

    fakeClock.advance(1);
    expect(resolveSession(db, token)).toBeNull();
  });

  it('applies a changed idle timeout to sessions that are already open, at once', () => {
    const { token } = open();
    fakeClock.advance(10 * MINUTE_MS);
    expect(resolveSession(db, token)).not.toBeNull();

    setIdleTimeoutMinutes(5);

    expect(resolveSession(db, token)).toBeNull();
  });

  it('allows a longer idle time when an administrator raises the timeout', () => {
    const { token } = open();
    setIdleTimeoutMinutes(60);
    fakeClock.advance(59 * MINUTE_MS);

    expect(resolveSession(db, token)).not.toBeNull();
  });

  it('falls back to the 15-minute default when the settings row is missing', () => {
    const { token } = open();
    expect(db.select().from(securitySettings).all()).toHaveLength(0);

    fakeClock.advance(15 * MINUTE_MS - 1);
    expect(resolveSession(db, token)).not.toBeNull();
    fakeClock.advance(1);
    expect(resolveSession(db, token)).toBeNull();
  });
});

describe('resolveSession: absolute lifetime (SEC-21)', () => {
  it('ends a session 12 hours after login however active it is', () => {
    const { token, session } = open();

    // Activity every 10 minutes keeps the idle clock fresh the whole time.
    for (let elapsed = 10; elapsed < 12 * 60; elapsed += 10) {
      fakeClock.set(new Date(T0.getTime() + elapsed * MINUTE_MS));
      expect(resolveSession(db, token), `at +${elapsed} min`).not.toBeNull();
      touchSession(db, session.id);
    }

    fakeClock.set(new Date(T0.getTime() + 12 * HOUR_MS - 1));
    expect(resolveSession(db, token)).not.toBeNull();

    fakeClock.set(new Date(T0.getTime() + 12 * HOUR_MS));
    expect(resolveSession(db, token)).toBeNull();
    expect(rowFor(token)?.revokedAt).toStrictEqual(new Date(T0.getTime() + 12 * HOUR_MS));
  });
});

describe('resolveSession: the user behind the session', () => {
  it('rejects the session of a blocked user and revokes it, so unblocking does not revive it', () => {
    const { token } = open();
    db.update(users).set({ isBlocked: true }).run();

    expect(resolveSession(db, token)).toBeNull();
    expect(rowFor(token)?.revokedAt).toStrictEqual(T0);

    db.update(users).set({ isBlocked: false }).run();
    expect(resolveSession(db, token)).toBeNull();
  });

  it('rejects the session of a soft-deleted user and revokes it', () => {
    const { token } = open();
    db.update(users).set({ deletedAt: T0 }).run();

    expect(resolveSession(db, token)).toBeNull();
    expect(rowFor(token)?.revokedAt).toStrictEqual(T0);
  });
});

describe('touchSession', () => {
  it('moves the idle clock to now', () => {
    const { token, session } = open();
    fakeClock.advance(7 * MINUTE_MS);

    touchSession(db, session.id);

    expect(rowFor(token)?.lastActivityAt).toStrictEqual(new Date(T0.getTime() + 7 * MINUTE_MS));
  });

  it('leaves a revoked session alone', () => {
    const { token, session } = open();
    revokeSession(db, session.id);
    fakeClock.advance(7 * MINUTE_MS);

    touchSession(db, session.id);

    expect(rowFor(token)?.lastActivityAt).toStrictEqual(T0);
  });
});

describe('revokeSessionByToken', () => {
  it('revokes the session the token belongs to', () => {
    const { token } = open();

    revokeSessionByToken(db, token);

    expect(resolveSession(db, token)).toBeNull();
    expect(rowFor(token)?.revokedAt).toStrictEqual(T0);
  });

  it('ignores unknown and malformed tokens', () => {
    const { token } = open();

    revokeSessionByToken(db, 'B'.repeat(43));
    revokeSessionByToken(db, 'not-a-token');

    expect(resolveSession(db, token)).not.toBeNull();
  });
});

describe('revokeAllForUser', () => {
  it('ends every live session of the user and reports how many', () => {
    const first = open();
    const second = open();
    const alreadyRevoked = open();
    revokeSession(db, alreadyRevoked.session.id);

    expect(revokeAllForUser(db, userId)).toBe(2);

    expect(resolveSession(db, first.token)).toBeNull();
    expect(resolveSession(db, second.token)).toBeNull();
  });

  it('can spare one session, for the device where the user just changed the password', () => {
    const current = open();
    const other = open();

    expect(revokeAllForUser(db, userId, { exceptSessionId: current.session.id })).toBe(1);

    expect(resolveSession(db, current.token)).not.toBeNull();
    expect(resolveSession(db, other.token)).toBeNull();
  });

  it('never touches another user’s sessions', () => {
    const otherUserId = insertUser(db, { login: 'employee2' });
    const mine = open();
    const theirs = createSession(db, otherUserId, 'FULLY_AUTHENTICATED');

    revokeAllForUser(db, userId);

    expect(resolveSession(db, mine.token)).toBeNull();
    expect(resolveSession(db, theirs.token)).not.toBeNull();
  });
});

describe('rotateSession', () => {
  it('replaces the token and stage: the old token dies, the new one works', () => {
    const old = open('INITIAL_PASSWORD_CHANGE');

    const fresh = rotateSession(db, old.session, 'FULLY_AUTHENTICATED');

    expect(fresh.token).not.toBe(old.token);
    expect(resolveSession(db, old.token)).toBeNull();
    expect(resolveSession(db, fresh.token)?.session).toMatchObject({
      userId,
      authStage: 'FULLY_AUTHENTICATED',
    });
  });

  it('is all or nothing: if the new session cannot be created, the old one stays valid', () => {
    const old = open('INITIAL_PASSWORD_CHANGE');
    // The old session is real but names a user that does not exist, so the insert fails the
    // foreign key after the revoke has already run inside the same transaction.
    const broken = { ...old.session, userId: 'no-such-user' };

    expect(() => rotateSession(db, broken, 'FULLY_AUTHENTICATED')).toThrow();

    expect(resolveSession(db, old.token)).not.toBeNull();
  });
});

describe('sessions survive a restart without ever storing the token (SEC-30)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'securedesk-sessions-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** Everything SQLite wrote to disk: the database file plus its write-ahead log and index. */
  const diskBytes = (file: string) =>
    Buffer.concat(
      ['', '-wal', '-shm']
        .filter((suffix) => existsSync(file + suffix))
        .map((suffix) => readFileSync(file + suffix)),
    );

  it('still honours a session after the database is closed and reopened, and the raw token is not on disk', () => {
    const file = path.join(dir, 'app.db');
    const first = createDb(file);
    runMigrations(first);
    const ownerId = insertUser(first);
    const { token } = createSession(first, ownerId, 'FULLY_AUTHENTICATED');
    const whileOpen = diskBytes(file); // the session is still in the write-ahead log here
    first.$client.close();

    const reopened = createDb(file);
    const resolved = resolveSession(reopened, token);
    reopened.$client.close();
    const afterClose = diskBytes(file);

    expect(resolved?.user.id).toBe(ownerId);
    for (const bytes of [whileOpen, afterClose]) {
      // Control: the digest is there, so the search would have found the token if it were.
      expect(bytes.includes(hashSessionToken(token))).toBe(true);
      expect(bytes.includes(token)).toBe(false);
    }
  });
});
