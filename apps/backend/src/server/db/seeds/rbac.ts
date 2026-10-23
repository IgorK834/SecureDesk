import { and, eq } from 'drizzle-orm';
import { PERMISSIONS } from '../../permissions/codes';
import {
  PERMISSION_DESCRIPTIONS,
  ROLE_DEFINITIONS,
  ROLE_PERMISSIONS,
} from '../../permissions/matrix';
import type { AppTransaction } from '../connection';
import { permissions, rolePermissions, roles } from '../schema';

/**
 * Writes the four roles, the 15 permissions and the role/permission links from the matrix.
 * Roles and permissions are inserted `ON CONFLICT DO NOTHING` on stable keys, so re-running adds
 * what is missing and never duplicates or rewrites what is there.
 *
 * The links are different: they are *synchronized* to the matrix, which is the single source of
 * truth. Missing links are added and any link the matrix does not grant is removed, so taking a
 * permission away from a role in the code also takes it away in the database on the next seed.
 * (Authorization reads the links on every request, so the removal takes effect immediately.)
 */
export function seedRbac(tx: AppTransaction): void {
  tx.insert(roles)
    .values(ROLE_DEFINITIONS.map(({ id, name, description }) => ({ id, name, description })))
    .onConflictDoNothing()
    .run();

  tx.insert(permissions)
    .values(
      Object.values(PERMISSIONS).map((code) => ({
        id: code,
        code,
        description: PERMISSION_DESCRIPTIONS[code],
      })),
    )
    .onConflictDoNothing()
    .run();

  const links = Object.entries(ROLE_PERMISSIONS).flatMap(([roleId, codes]) =>
    codes.map((code) => ({ roleId, permissionId: code })),
  );
  tx.insert(rolePermissions).values(links).onConflictDoNothing().run();

  const granted = new Set(links.map(({ roleId, permissionId }) => `${roleId}|${permissionId}`));
  for (const link of tx.select().from(rolePermissions).all()) {
    if (granted.has(`${link.roleId}|${link.permissionId}`)) continue;
    tx.delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, link.roleId),
          eq(rolePermissions.permissionId, link.permissionId),
        ),
      )
      .run();
  }
}
