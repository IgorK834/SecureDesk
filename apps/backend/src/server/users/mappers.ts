import type { UserRow } from '../db/schema';

/** The only user shape that may leave the server (API responses, logs, the Angular client). */
export interface SafeUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  roleId: string;
  mustChangePassword: boolean;
  isBlocked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Allowlist mapper: every field is copied by name, so a column added to `users` later (or any
 * stray property on the row) stays server-side until someone deliberately adds it here. A
 * database row is never serialized directly: `passwordHash` and `deletedAt` in particular
 * must not reach a client, and `loginNormalized` is an internal lookup key.
 */
export function toSafeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    login: row.login,
    firstName: row.firstName,
    lastName: row.lastName,
    roleId: row.roleId,
    mustChangePassword: row.mustChangePassword,
    isBlocked: row.isBlocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
