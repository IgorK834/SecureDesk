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
 * Every insert is `ON CONFLICT DO NOTHING` on stable keys, so re-running adds what is missing
 * and never duplicates or rewrites what is there.
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

  tx.insert(rolePermissions)
    .values(
      Object.entries(ROLE_PERMISSIONS).flatMap(([roleId, codes]) =>
        codes.map((code) => ({ roleId, permissionId: code })),
      ),
    )
    .onConflictDoNothing()
    .run();
}
