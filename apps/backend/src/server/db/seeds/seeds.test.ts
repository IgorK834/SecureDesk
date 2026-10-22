import { verify } from 'argon2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from '../../permissions/codes';
import { ROLE_PERMISSIONS } from '../../permissions/matrix';
import { setClockForTests } from '../../time/clock';
import { normalizeLogin } from '../../users/login';
import {
  captureError,
  createMigratedDb,
  ensureRole,
  insertUser,
  sqliteCode,
} from '../__fixtures__/test-db';
import type { AppDb } from '../connection';
import { permissions, rolePermissions, roles, securitySettings, users } from '../schema';
import { type SeedResult, seedDatabase } from '.';
import { SEED_USERS, insertUsers, prepareNewUsers } from './users';

let db: AppDb;
const extraDbs: AppDb[] = [];

beforeEach(() => {
  db = createMigratedDb();
});

afterEach(() => {
  setClockForTests();
  db.$client.close();
  while (extraDbs.length) extraDbs.pop()?.$client.close();
});

const allUsers = () => db.select().from(users).all();
const hashByLogin = () => Object.fromEntries(allUsers().map((u) => [u.login, u.passwordHash]));
const passwordByLogin = (result: SeedResult) =>
  Object.fromEntries(result.created.map(({ login, password }) => [login, password]));

describe('seedDatabase on an empty database', () => {
  it('creates exactly 4 roles and 7 users, at least two in each of Manager, Employee and Guest', async () => {
    await seedDatabase(db);

    expect(
      db
        .select({ id: roles.id })
        .from(roles)
        .all()
        .map((r) => r.id)
        .sort(),
    ).toEqual(Object.values(ROLES).sort());
    expect(allUsers()).toHaveLength(7);
    const perRole = (roleId: string) => allUsers().filter((u) => u.roleId === roleId).length;
    expect(perRole(ROLES.ADMINISTRATOR)).toBe(1);
    expect(perRole(ROLES.MANAGER)).toBeGreaterThanOrEqual(2);
    expect(perRole(ROLES.EMPLOYEE)).toBeGreaterThanOrEqual(2);
    expect(perRole(ROLES.GUEST)).toBeGreaterThanOrEqual(2);
  });

  it('stores only Argon2id hashes and forces a password change for every account', async () => {
    await seedDatabase(db);

    for (const user of allUsers()) {
      expect(user.passwordHash, user.login).toMatch(/^\$argon2id\$/);
      expect(user.mustChangePassword, user.login).toBe(true);
      expect(user.passwordChangedAt, user.login).toBeNull();
    }
  });

  it('returns each generated password, and it is the one the stored hash verifies', async () => {
    const result = await seedDatabase(db);

    expect(result.created.map((c) => c.login).sort()).toEqual(
      SEED_USERS.map((u) => u.login).sort(),
    );
    expect(result.skipped).toEqual([]);
    const hashes = hashByLogin();
    for (const { login, password } of result.created) {
      expect(password).toHaveLength(16);
      expect(await verify(hashes[login] as string, password), login).toBe(true);
    }
  });

  it('creates the 15 permissions and links them to roles exactly as the matrix says', async () => {
    await seedDatabase(db);

    expect(
      db
        .select({ code: permissions.code })
        .from(permissions)
        .all()
        .map((p) => p.code)
        .sort(),
    ).toEqual(Object.values(PERMISSIONS).sort());
    const linked = db
      .select()
      .from(rolePermissions)
      .all()
      .map((l) => `${l.roleId}|${l.permissionId}`);
    const expected = Object.entries(ROLE_PERMISSIONS).flatMap(([roleId, codes]) =>
      codes.map((code) => `${roleId}|${code}`),
    );
    expect(linked.sort()).toEqual(expected.sort());
    expect(linked).toHaveLength(21);
  });

  it('creates the single settings row with the variant-2 defaults', async () => {
    await seedDatabase(db);

    expect(db.select().from(securitySettings).all()).toMatchObject([
      {
        id: 1,
        minPasswordLength: 12,
        rejectPersonalDataInPassword: false,
        passwordMaxAgeDays: null,
        sessionIdleTimeoutMinutes: 15,
      },
    ]);
  });

  it('gives the six test users a 12-hour temporary password, and ADMIN one that does not lapse', async () => {
    const now = new Date('2030-06-01T08:00:00.000Z');
    setClockForTests({ now: () => now });

    await seedDatabase(db);

    const admin = allUsers().find((u) => u.login === 'ADMIN');
    expect(admin?.temporaryPasswordExpiresAt).toBeNull();
    const others = allUsers().filter((u) => u.login !== 'ADMIN');
    expect(others).toHaveLength(6);
    for (const user of others) {
      expect(user.temporaryPasswordExpiresAt, user.login).toEqual(
        new Date('2030-06-01T20:00:00.000Z'),
      );
      expect(user.createdAt).toEqual(now);
    }
  });

  it('makes ADMIN an Administrator who satisfies the protected-account invariants', async () => {
    await seedDatabase(db);

    const admin = allUsers().find((u) => u.loginNormalized === 'admin');
    expect(admin).toMatchObject({
      login: 'ADMIN',
      firstName: 'System',
      lastName: 'Administrator',
      roleId: ROLES.ADMINISTRATOR,
      isBlocked: false,
      deletedAt: null,
    });
    // The database trigger protects the row whose normalized login is 'admin', so the seed
    // must store exactly that value for the protection to apply.
    const error = captureError(() =>
      db.$client.prepare("DELETE FROM users WHERE login = 'ADMIN'").run(),
    );
    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_TRIGGER');
  });

  it('uses fixed logins and distinct, realistic names (needed by the personal-data password rule tests)', () => {
    expect(SEED_USERS.map((u) => u.login)).toEqual([
      'ADMIN',
      'manager1',
      'manager2',
      'employee1',
      'employee2',
      'guest1',
      'guest2',
    ]);
    const names = SEED_USERS.flatMap((u) => [u.firstName, u.lastName].map((n) => n.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
    const logins = SEED_USERS.map((u) => normalizeLogin(u.login));
    expect(names.filter((name) => logins.some((login) => login.includes(name)))).toEqual([]);
  });
});

describe('running the seed again', () => {
  it('adds nothing, creates no password and reports every account as skipped', async () => {
    await seedDatabase(db);
    const counts = () =>
      [roles, permissions, rolePermissions, securitySettings, users].map(
        (t) => db.select().from(t).all().length,
      );
    const before = counts();

    const second = await seedDatabase(db);

    expect(counts()).toEqual(before);
    expect(second.created).toEqual([]);
    expect(second.skipped).toHaveLength(7);
  });

  it('never changes the hash of an account whose password was changed in between', async () => {
    await seedDatabase(db);
    db.$client
      .prepare(
        "UPDATE users SET password_hash = 'hash-chosen-by-the-user', must_change_password = 0 WHERE login = 'employee1'",
      )
      .run();
    const before = hashByLogin();

    await seedDatabase(db);

    expect(hashByLogin()).toEqual(before);
    expect(hashByLogin().employee1).toBe('hash-chosen-by-the-user');
  });

  it('matches existing accounts by normalized login, so a differently-cased account is not duplicated', async () => {
    insertUser(db, {
      login: 'EMPLOYEE1',
      roleId: ROLES.EMPLOYEE,
      passwordHash: 'pre-existing-hash',
    });

    const result = await seedDatabase(db);

    expect(allUsers()).toHaveLength(7);
    expect(hashByLogin().EMPLOYEE1).toBe('pre-existing-hash');
    expect(result.skipped).toEqual(['employee1']);
    expect(result.created).toHaveLength(6);
  });

  it('recreates only a missing account, with a new password, and leaves the others untouched', async () => {
    await seedDatabase(db);
    const before = hashByLogin();
    db.$client.prepare("DELETE FROM users WHERE login = 'guest2'").run();

    const result = await seedDatabase(db);

    expect(result.created.map((c) => c.login)).toEqual(['guest2']);
    const after = hashByLogin();
    expect(after.guest2).not.toBe(before.guest2);
    expect({ ...after, guest2: '' }).toEqual({ ...before, guest2: '' });
  });

  it('generates and hashes nothing for accounts that already exist', async () => {
    await seedDatabase(db);

    expect(await prepareNewUsers(db)).toEqual([]);
  });
});

describe('two seeds on two empty databases', () => {
  it('produce different passwords and different hashes for the same login (no hard-coded secret)', async () => {
    const otherDb = createMigratedDb();
    extraDbs.push(otherDb);

    const first = await seedDatabase(db);
    const second = await seedDatabase(otherDb);

    const firstHashes = hashByLogin();
    const secondHashes = Object.fromEntries(
      otherDb
        .select()
        .from(users)
        .all()
        .map((u) => [u.login, u.passwordHash]),
    );
    for (const { login } of SEED_USERS) {
      expect(passwordByLogin(first)[login], login).not.toBe(passwordByLogin(second)[login]);
      expect(firstHashes[login], login).not.toBe(secondHashes[login]);
    }
  });
});

describe('seeding is all-or-nothing', () => {
  it('rolls everything back when one step fails, instead of leaving a half-seeded database', async () => {
    // A role that owns the name "Manager" under another id makes the seed's own manager role
    // conflict and be skipped, so linking permissions to it fails the foreign key mid-way.
    db.insert(roles).values({ id: 'legacy', name: 'Manager', description: 'pre-existing' }).run();

    await expect(seedDatabase(db)).rejects.toThrow();

    expect(allUsers()).toHaveLength(0);
    expect(db.select().from(permissions).all()).toHaveLength(0);
    expect(db.select().from(securitySettings).all()).toHaveLength(0);
    expect(
      db
        .select()
        .from(roles)
        .all()
        .map((r) => r.id),
    ).toEqual(['legacy']);
  });

  it('does not report a password for an account that another seed created after this one prepared', async () => {
    const prepared = await prepareNewUsers(db);
    // A concurrent seed wins the race for guest1 between prepare and insert.
    Object.values(ROLES).forEach((roleId) => ensureRole(db, roleId));
    insertUser(db, {
      login: 'guest1',
      roleId: ROLES.GUEST,
      passwordHash: 'written-by-a-concurrent-seed',
    });

    const created = db.transaction((tx) => insertUsers(tx, prepared));

    expect(created.map(({ user }) => user.login)).toHaveLength(6);
    expect(created.map(({ user }) => user.login)).not.toContain('guest1');
    expect(hashByLogin().guest1).toBe('written-by-a-concurrent-seed');
  });
});
