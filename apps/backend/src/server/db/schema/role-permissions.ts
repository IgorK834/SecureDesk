import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { permissions } from './permissions';
import { roles } from './roles';

/** Which permissions a role grants. The composite key makes a duplicate link impossible. */
export const rolePermissions = sqliteTable(
  'role_permissions',
  {
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: text('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);
