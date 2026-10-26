import type { UserRow } from '../db/schema';

/** The only user shape that may leave the server (API responses, logs, the Angular client). */
export interface SafeUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  roleId: string;
  mustChangePassword: boolean;
  totpEnabled: boolean;
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
 * The account as the administrator's user management shows it. A strict allowlist, never a row:
 * there is no password hash, no `login_normalized` and no `deleted_at` (deleted accounts are not
 * listed at all). Whether the account is active, blocked or still owes its first password change
 * is derived from `isBlocked` and `mustChangePassword`.
 */
export interface AdminUserDto {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  /** The role code, e.g. `EMPLOYEE`. */
  role: string;
  isBlocked: boolean;
  mustChangePassword: boolean;
  /** When the current administrator-issued password stops working; null if there is none. */
  temporaryPasswordExpiresAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns `toAdminUserDto` reads; queries select exactly these, so a hash is never loaded. */
export type AdminUserSource = Pick<
  UserRow,
  | 'id'
  | 'login'
  | 'firstName'
  | 'lastName'
  | 'roleId'
  | 'isBlocked'
  | 'mustChangePassword'
  | 'temporaryPasswordExpiresAt'
  | 'passwordChangedAt'
  | 'createdAt'
  | 'updatedAt'
>;

/** Allowlist mapper like `toSafeUser`: every field is copied by name, so nothing else can leak. */
export function toAdminUserDto(row: AdminUserSource): AdminUserDto {
  return {
    id: row.id,
    login: row.login,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.roleId.toUpperCase(),
    isBlocked: row.isBlocked,
    mustChangePassword: row.mustChangePassword,
    temporaryPasswordExpiresAt: row.temporaryPasswordExpiresAt,
    passwordChangedAt: row.passwordChangedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
    totpEnabled: row.totpEnabledAt !== null,
    isBlocked: row.isBlocked,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
