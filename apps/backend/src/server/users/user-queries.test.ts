import { beforeEach, describe, expect, it } from 'vitest';
import type { AppDb } from '../db/connection';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import { users } from '../db/schema';
import { NotFoundError } from '../http/errors';
import { ROLES } from '../permissions/codes';
import { ADMIN_USER_COLUMNS, escapeLike, getUser, listUsers } from './user-queries';

const DELETED_AT = new Date('2030-03-01T00:00:00.000Z');
const ALL = { page: 1, pageSize: 100 } as const;

let db: AppDb;
let ids: Record<string, string>;

// A small, deliberately awkward population. Names are chosen so that a `%`, `_` or `\` typed into
// the search box has a literal match (the "-lit" accounts) and plenty of wrong matches nearby
// (the "-lure" accounts) that only a broken escape would return.
beforeEach(() => {
  db = createMigratedDb();
  ids = {
    alice: insertUser(db, { login: 'alice', firstName: 'Alice', lastName: 'Active' }),
    bob: insertUser(db, {
      login: 'bob',
      firstName: 'Bob',
      lastName: 'Pending',
      roleId: ROLES.MANAGER,
      mustChangePassword: true,
    }),
    carol: insertUser(db, {
      login: 'carol',
      firstName: 'Carol',
      lastName: 'Blocked',
      roleId: ROLES.GUEST,
      isBlocked: true,
    }),
    // Blocked AND still owing the first change: it counts as blocked only.
    dave: insertUser(db, {
      login: 'dave',
      firstName: 'Dave',
      lastName: 'Both',
      roleId: ROLES.GUEST,
      isBlocked: true,
      mustChangePassword: true,
    }),
    erin: insertUser(db, {
      login: 'erin',
      firstName: 'Erin',
      lastName: 'Deleted',
      deletedAt: DELETED_AT,
    }),
    percentLit: insertUser(db, { login: 'pct-lit', firstName: '100%', lastName: 'Sale' }),
    percentLure: insertUser(db, { login: 'pct-lure', firstName: '100x', lastName: 'Sale' }),
    underscoreLit: insertUser(db, { login: 'us_lit', firstName: 'Una', lastName: 'Nine' }),
    underscoreLure: insertUser(db, { login: 'usxlit', firstName: 'Una', lastName: 'Nine' }),
    backslashLit: insertUser(db, { login: 'bs-lit', firstName: 'Bea', lastName: 'Back\\slash' }),
    backslashLure: insertUser(db, { login: 'bs-lure', firstName: 'Bea', lastName: 'Backxslash' }),
  };
});

const logins = (result: { items: { login: string }[] }) => result.items.map((u) => u.login);

describe('escapeLike', () => {
  it.each([
    ['100%', '100\\%'],
    ['a_b', 'a\\_b'],
    ['back\\slash', 'back\\\\slash'],
    ['%_\\', '\\%\\_\\\\'],
    ['plain', 'plain'],
  ])('turns %j into %j', (input, expected) => {
    expect(escapeLike(input)).toBe(expected);
  });
});

describe('listUsers: what is listed', () => {
  it('never lists a soft-deleted account, and does not count it either', () => {
    const result = listUsers(db, ALL);

    expect(logins(result)).not.toContain('erin');
    expect(result.total).toBe(10); // 11 inserted, 1 deleted
    expect(result.items).toHaveLength(10);
  });

  it('orders by login so the table is stable, and pages never repeat or skip an account', () => {
    const everything = logins(listUsers(db, ALL));
    expect(everything).toStrictEqual([...everything].sort());

    const pages = [1, 2, 3, 4].map((page) => logins(listUsers(db, { page, pageSize: 3 })));

    expect(pages.flat()).toStrictEqual(everything);
    expect(pages.map((p) => p.length)).toStrictEqual([3, 3, 3, 1]);
  });

  it('reports the total of the whole match, not of the page, and an empty page past the end', () => {
    const second = listUsers(db, { page: 2, pageSize: 4 });
    const pastTheEnd = listUsers(db, { page: 99, pageSize: 4 });

    expect(second.total).toBe(10);
    expect(second.items).toHaveLength(4);
    expect(pastTheEnd).toStrictEqual({ items: [], total: 10 });
  });
});

describe('listUsers: status', () => {
  const byStatus = (status: 'active' | 'blocked' | 'pending') =>
    logins(listUsers(db, { ...ALL, status }));

  it('returns each state as its own subset', () => {
    expect(byStatus('blocked')).toStrictEqual(['carol', 'dave']);
    expect(byStatus('pending')).toStrictEqual(['bob']);
    expect(byStatus('active')).toStrictEqual([
      'alice',
      'bs-lit',
      'bs-lure',
      'pct-lit',
      'pct-lure',
      'us_lit',
      'usxlit',
    ]);
  });

  it('puts an account that is blocked and still owes its first change under "blocked" only', () => {
    expect(byStatus('blocked')).toContain('dave');
    expect(byStatus('pending')).not.toContain('dave');
    expect(byStatus('active')).not.toContain('dave');
  });

  it('partitions the live accounts: every one in exactly one state, none in two', () => {
    const states = [byStatus('active'), byStatus('blocked'), byStatus('pending')].flat();

    expect([...states].sort()).toStrictEqual(logins(listUsers(db, ALL)).sort());
    expect(new Set(states).size).toBe(states.length);
  });
});

describe('listUsers: role', () => {
  it('keeps only accounts with that role', () => {
    expect(logins(listUsers(db, { ...ALL, role: 'MANAGER' }))).toStrictEqual(['bob']);
    expect(logins(listUsers(db, { ...ALL, role: 'GUEST' }))).toStrictEqual(['carol', 'dave']);
  });
});

describe('listUsers: search text', () => {
  it.each([
    ['login', 'ali', ['alice']],
    ['first name', 'Bob', ['bob']],
    ['last name', 'Blocked', ['carol']],
    ['part of a name', 'ndin', ['bob']],
  ])('matches on the %s (%j)', (_field, q, expected) => {
    expect(logins(listUsers(db, { ...ALL, q }))).toStrictEqual(expected);
  });

  it('ignores case in logins, including letters only a normalizing lookup folds', () => {
    expect(logins(listUsers(db, { ...ALL, q: 'ALICE' }))).toStrictEqual(['alice']);
    expect(logins(listUsers(db, { ...ALL, q: 'ＡＬＩＣＥ' }))).toStrictEqual(['alice']); // full-width
  });

  it('treats % as a literal percent sign, not "anything"', () => {
    const result = listUsers(db, { ...ALL, q: '%' });

    expect(logins(result)).toStrictEqual(['pct-lit']);
    expect(result.total).toBe(1); // a wildcard would have matched every live account
  });

  it('treats _ as a literal underscore, not "any one character"', () => {
    expect(logins(listUsers(db, { ...ALL, q: '_' }))).toStrictEqual(['us_lit']);
    expect(logins(listUsers(db, { ...ALL, q: 'us_lit' }))).toStrictEqual(['us_lit']); // not usxlit
  });

  it('treats a backslash as a literal backslash, not as the escape character', () => {
    expect(logins(listUsers(db, { ...ALL, q: '\\' }))).toStrictEqual(['bs-lit']);
    expect(logins(listUsers(db, { ...ALL, q: 'Back\\slash' }))).toStrictEqual(['bs-lit']);
  });

  it('cannot be turned into SQL: the text is a bound value', () => {
    const injection = "x' OR '1'='1' --";

    expect(listUsers(db, { ...ALL, q: injection })).toStrictEqual({ items: [], total: 0 });
    expect(listUsers(db, { ...ALL, q: "'; DROP TABLE users; --" }).total).toBe(0);
    expect(db.select().from(users).all()).toHaveLength(11); // the table is intact
  });

  it('combines with the other filters (all must hold)', () => {
    const carol = { ...ALL, q: 'Blocked', role: 'GUEST', status: 'blocked' } as const;

    expect(logins(listUsers(db, carol))).toStrictEqual(['carol']);
    // Drop any one condition's match and the account disappears.
    expect(listUsers(db, { ...carol, role: 'MANAGER' }).total).toBe(0);
    expect(listUsers(db, { ...carol, status: 'active' }).total).toBe(0);
    expect(listUsers(db, { ...carol, q: 'nobody' }).total).toBe(0);
  });
});

describe('getUser', () => {
  it('returns the account as an allowlisted DTO', () => {
    const dto = getUser(db, ids.bob as string);

    expect(dto).toMatchObject({ login: 'bob', role: 'MANAGER', mustChangePassword: true });
    expect(Object.keys(dto).sort()).toStrictEqual(
      [
        'id',
        'login',
        'firstName',
        'lastName',
        'role',
        'isBlocked',
        'mustChangePassword',
        'temporaryPasswordExpiresAt',
        'passwordChangedAt',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('answers a soft-deleted account exactly like one that never existed', () => {
    expect(() => getUser(db, ids.erin as string)).toThrow(NotFoundError);
    expect(() => getUser(db, '00000000-0000-4000-8000-000000000000')).toThrow(NotFoundError);
  });
});

describe('ADMIN_USER_COLUMNS', () => {
  it('never selects the password hash, the normalized login or the deletion marker', () => {
    expect(Object.keys(ADMIN_USER_COLUMNS)).not.toEqual(expect.arrayContaining(['passwordHash']));
    expect(Object.keys(ADMIN_USER_COLUMNS)).not.toContain('loginNormalized');
    expect(Object.keys(ADMIN_USER_COLUMNS)).not.toContain('deletedAt');
  });
});
