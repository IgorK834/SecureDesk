import type { Role } from '../../core/auth/auth.models';
import type { AdminUser, UserStatus } from '../../core/http/admin-api.service';

export const STATUS_LABELS: Record<UserStatus, string> = {
  active: 'Active',
  blocked: 'Blocked',
  pending: 'Pending first login',
};

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  GUEST: 'Guest',
};

/**
 * The same three states the server filters by. A blocked account is "blocked" whether or not it
 * also owes its first password change, so each account is in exactly one state.
 */
export function userStatus(user: Pick<AdminUser, 'isBlocked' | 'mustChangePassword'>): UserStatus {
  if (user.isBlocked) return 'blocked';
  return user.mustChangePassword ? 'pending' : 'active';
}

/**
 * True for an account that is still waiting for its first login and whose temporary password has
 * run out, so the administrator knows it must be reset. Like the server, it counts as expired
 * from the very instant of `temporaryPasswordExpiresAt`.
 */
export function hasExpiredTemporaryPassword(
  user: Pick<AdminUser, 'isBlocked' | 'mustChangePassword' | 'temporaryPasswordExpiresAt'>,
  now: number = Date.now(),
): boolean {
  return (
    userStatus(user) === 'pending' &&
    user.temporaryPasswordExpiresAt !== null &&
    now >= Date.parse(user.temporaryPasswordExpiresAt)
  );
}

/**
 * Mirrors the server's rule for the permanent ADMIN account (`login_normalized = 'admin'`), only
 * to disable buttons that would be refused. The server still answers 409 `PROTECTED_ACCOUNT`.
 */
export function isProtectedAccount(user: Pick<AdminUser, 'login'>): boolean {
  return user.login.normalize('NFKC').toLowerCase() === 'admin';
}
