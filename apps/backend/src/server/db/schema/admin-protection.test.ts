import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROLES } from '../../permissions/codes';
import {
  captureError,
  createMigratedDb,
  ensureRole,
  insertUser,
  sqliteCode,
} from '../__fixtures__/test-db';
import type { AppDb } from '../connection';
import { users } from '.';

let db: AppDb;
let adminId: string;
let otherId: string;

beforeEach(() => {
  db = createMigratedDb();
  adminId = insertUser(db, { login: 'ADMIN', roleId: ROLES.ADMINISTRATOR });
  otherId = insertUser(db, { login: 'employee1' });
  ensureRole(db, ROLES.MANAGER);
});

afterEach(() => db.$client.close());

const updateAdmin = (set: Partial<typeof users.$inferInsert>) =>
  db
    .update(users)
    .set(set)
    .where(sql`${users.id} = ${adminId}`)
    .run();

function expectTriggerRejection(action: () => unknown) {
  const error = captureError(action);
  expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_TRIGGER');
  expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).toMatch(/ADMIN account cannot/);
}

describe('the database protects the ADMIN account (defense in depth behind the service layer)', () => {
  it('rejects deleting ADMIN', () => {
    expectTriggerRejection(() =>
      db
        .delete(users)
        .where(sql`${users.id} = ${adminId}`)
        .run(),
    );
    expect(
      db
        .select()
        .from(users)
        .all()
        .map((row) => row.id),
    ).toContain(adminId);
  });

  it('rejects blocking ADMIN', () => {
    expectTriggerRejection(() => updateAdmin({ isBlocked: true }));
  });

  it('rejects soft-deleting ADMIN', () => {
    expectTriggerRejection(() => updateAdmin({ deletedAt: new Date() }));
  });

  it('rejects changing the role of ADMIN', () => {
    expectTriggerRejection(() => updateAdmin({ roleId: ROLES.MANAGER }));
  });

  it.each([
    ['its display login', { login: 'Admin' }],
    [
      'its normalized login (renaming then deleting would otherwise bypass the delete rule)',
      { loginNormalized: 'renamed' },
    ],
  ])('rejects renaming ADMIN: %s', (_label, change) => {
    expectTriggerRejection(() => updateAdmin(change));
  });

  it('leaves ADMIN unchanged after every rejected attempt', () => {
    for (const change of [
      { isBlocked: true },
      { deletedAt: new Date() },
      { roleId: ROLES.MANAGER },
    ]) {
      captureError(() => updateAdmin(change));
    }

    expect(
      db
        .select()
        .from(users)
        .where(sql`${users.id} = ${adminId}`)
        .all()[0],
    ).toMatchObject({
      login: 'ADMIN',
      roleId: ROLES.ADMINISTRATOR,
      isBlocked: false,
      deletedAt: null,
    });
  });

  it('still lets ADMIN change its own credentials and names (the forced first-login change)', () => {
    updateAdmin({
      passwordHash: 'new-hash',
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: new Date(),
      firstName: 'Changed',
    });

    expect(
      db
        .select()
        .from(users)
        .where(sql`${users.id} = ${adminId}`)
        .all()[0],
    ).toMatchObject({
      passwordHash: 'new-hash',
      mustChangePassword: false,
      firstName: 'Changed',
    });
  });

  it('does not restrict any other account', () => {
    db.update(users)
      .set({
        isBlocked: true,
        roleId: ROLES.MANAGER,
        deletedAt: new Date(),
        login: 'renamed',
        loginNormalized: 'renamed',
      })
      .where(sql`${users.id} = ${otherId}`)
      .run();
    db.delete(users)
      .where(sql`${users.id} = ${otherId}`)
      .run();

    expect(db.select().from(users).all()).toHaveLength(1);
  });
});
