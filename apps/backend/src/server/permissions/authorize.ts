import { ForbiddenError } from '../http/errors';
import { PERMISSIONS, type PermissionCode } from './codes';

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(PERMISSIONS));

/** Anything that carries permission codes: a resolved session, or the actor of a ticket check. */
export interface PermissionHolder {
  readonly permissions: readonly string[];
}

/**
 * Whether the holder was granted `code` by its role. The codes come from the database on every
 * request (role -> role_permissions), never from the cookie, so a permission removed from a role
 * stops working on the very next request.
 *
 * Deny by default: a code that is not one of `PERMISSIONS` is refused even if a stale database row
 * grants it, so a typo or a leftover can never turn into access.
 */
export function hasPermission(holder: PermissionHolder, code: PermissionCode): boolean {
  return KNOWN_CODES.has(code) && holder.permissions.includes(code);
}

/**
 * Throws `ForbiddenError` (403) unless the holder has the permission, or, when a list is given,
 * at least one of them. An empty list therefore denies everyone.
 */
export function requirePermission(
  holder: PermissionHolder,
  required: PermissionCode | readonly PermissionCode[],
): void {
  const codes = typeof required === 'string' ? [required] : required;
  if (!codes.some((code) => hasPermission(holder, code))) throw new ForbiddenError();
}
