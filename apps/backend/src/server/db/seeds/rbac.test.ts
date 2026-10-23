import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from '../../permissions/codes';
import { ROLE_PERMISSIONS } from '../../permissions/matrix';
import { createMigratedDb } from '../__fixtures__/test-db';
import type { AppDb } from '../connection';
import { permissions, rolePermissions, roles } from '../schema';
import { seedRbac } from './rbac';

let db: AppDb;

beforeEach(() => {
  db = createMigratedDb();
});

afterEach(() => db.$client.close());

const seed = () => db.transaction((tx) => seedRbac(tx));

// The role -> permission codes that the database really grants, read through the joins the
// application itself relies on (not from the raw link table), grouped per role id.
function grantedByRole(): Record<string, string[]> {
  const rows = db
    .select({ role: roles.id, code: permissions.code })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .all();
  const grouped: Record<string, string[]> = {};
  for (const { role, code } of rows) (grouped[role] ??= []).push(code);
  for (const codes of Object.values(grouped)) codes.sort();
  return grouped;
}

const expectedByRole = () =>
  Object.fromEntries(
    Object.entries(ROLE_PERMISSIONS).map(([role, codes]) => [role, [...codes].sort()]),
  );

const snapshot = () => ({
  roles: db.select().from(roles).orderBy(roles.id).all(),
  permissions: db.select().from(permissions).orderBy(permissions.id).all(),
  links: db
    .select()
    .from(rolePermissions)
    .orderBy(rolePermissions.roleId, rolePermissions.permissionId)
    .all(),
});

describe('seedRbac', () => {
  it('makes the role_permissions join in the database equal ROLE_PERMISSIONS exactly', () => {
    seed();

    expect(grantedByRole()).toEqual(expectedByRole());
  });

  it('creates the four roles and the 15 permissions', () => {
    seed();

    expect(
      db
        .select({ id: roles.id })
        .from(roles)
        .all()
        .map((r) => r.id)
        .sort(),
    ).toEqual(Object.values(ROLES).sort());
    expect(db.select().from(permissions).all()).toHaveLength(Object.values(PERMISSIONS).length);
  });

  it('changes nothing at all when it runs a second time', () => {
    seed();
    const first = snapshot();

    seed();

    expect(snapshot()).toEqual(first);
  });

  describe('synchronizing links with the matrix', () => {
    it('removes a link the matrix does not grant (a permission that was taken away)', () => {
      seed();
      db.insert(rolePermissions)
        .values({ roleId: ROLES.GUEST, permissionId: PERMISSIONS.USERS_READ })
        .run();
      expect(grantedByRole().guest).toContain('users:read');

      seed();

      expect(grantedByRole()).toEqual(expectedByRole());
    });

    it('restores a link the matrix grants but the database lost', () => {
      seed();
      db.delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, ROLES.MANAGER),
            eq(rolePermissions.permissionId, PERMISSIONS.TICKETS_ASSIGN),
          ),
        )
        .run();
      expect(grantedByRole().manager).not.toContain('tickets:assign');

      seed();

      expect(grantedByRole()).toEqual(expectedByRole());
    });

    it('removes a link of a permission that is no longer defined, without touching the others', () => {
      seed();
      db.insert(permissions)
        .values({ id: 'legacy:thing', code: 'legacy:thing', description: 'removed from the code' })
        .run();
      db.insert(rolePermissions)
        .values({ roleId: ROLES.EMPLOYEE, permissionId: 'legacy:thing' })
        .run();

      seed();

      expect(grantedByRole()).toEqual(expectedByRole());
    });

    it('does not rewrite what a role or permission already says (ON CONFLICT DO NOTHING)', () => {
      seed();
      db.update(roles)
        .set({ description: 'edited by hand' })
        .where(eq(roles.id, ROLES.GUEST))
        .run();

      seed();

      expect(db.select().from(roles).where(eq(roles.id, ROLES.GUEST)).get()?.description).toBe(
        'edited by hand',
      );
    });
  });
});
