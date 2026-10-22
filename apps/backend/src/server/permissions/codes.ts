/**
 * Stable, machine-readable role and permission identifiers. Every other module refers to
 * roles and permissions through these constants; strings are never accepted from clients.
 */
export const PERMISSIONS = {
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_BLOCK: 'users:block',
  USERS_DELETE: 'users:delete',
  USERS_RESET_PASSWORD: 'users:reset-password',
  SECURITY_SETTINGS_READ: 'security-settings:read',
  SECURITY_SETTINGS_UPDATE: 'security-settings:update',
  TICKETS_CREATE: 'tickets:create',
  TICKETS_READ_ALL: 'tickets:read:all',
  TICKETS_READ_ASSIGNED: 'tickets:read:assigned',
  TICKETS_READ_OWN: 'tickets:read:own',
  TICKETS_ASSIGN: 'tickets:assign',
  TICKETS_STATUS_UPDATE_ALL: 'tickets:status:update:all',
  TICKETS_STATUS_UPDATE_ASSIGNED: 'tickets:status:update:assigned',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Values are the `roles.id` primary keys, so they are the same in every database. */
export const ROLES = {
  ADMINISTRATOR: 'administrator',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  GUEST: 'guest',
} as const;

export type RoleId = (typeof ROLES)[keyof typeof ROLES];
