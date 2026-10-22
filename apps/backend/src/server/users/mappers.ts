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

/** The user fields shown to a signed-in user in login and `/me` responses. */
export interface Profile {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  /** The role code, e.g. `EMPLOYEE`. */
  role: string;
}

/** Accepts a row or a SafeUser; copies fields by name, so nothing else can slip into a response. */
export function toProfile(
  user: Pick<SafeUser, 'id' | 'login' | 'firstName' | 'lastName' | 'roleId'>,
): Profile {
  return {
    id: user.id,
    login: user.login,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.roleId.toUpperCase(),
  };
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
