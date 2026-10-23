import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '../http/errors';
import { hasPermission, requirePermission } from './authorize';
import { PERMISSIONS, type PermissionCode } from './codes';

const holder = (...permissions: string[]) => ({ permissions });

describe('hasPermission', () => {
  it('is true only for a code the holder was granted', () => {
    const guest = holder('tickets:create', 'tickets:read:own');

    expect(hasPermission(guest, PERMISSIONS.TICKETS_CREATE)).toBe(true);
    expect(hasPermission(guest, PERMISSIONS.TICKETS_READ_ALL)).toBe(false);
    expect(hasPermission(guest, PERMISSIONS.USERS_READ)).toBe(false);
  });

  it('is false for a holder with no permissions at all', () => {
    expect(hasPermission(holder(), PERMISSIONS.TICKETS_CREATE)).toBe(false);
  });

  // The database could hold a permission the code no longer defines (a stale row, or one added by
  // hand). A route can never ask for it through the types, but if one did, it must not be a
  // way in: only the 15 defined codes can ever be allowed.
  it('denies a code that is not one of PERMISSIONS even when the holder has it', () => {
    const stale = holder('made:up', 'users:*', '');

    expect(hasPermission(stale, 'made:up' as PermissionCode)).toBe(false);
    expect(hasPermission(stale, 'users:*' as PermissionCode)).toBe(false);
    expect(hasPermission(stale, '' as PermissionCode)).toBe(false);
  });

  it('matches the exact code, not a prefix or a different case', () => {
    expect(hasPermission(holder('users:read'), 'users:read:all' as PermissionCode)).toBe(false);
    expect(hasPermission(holder('Users:Read'), PERMISSIONS.USERS_READ)).toBe(false);
  });
});

describe('requirePermission', () => {
  it('returns quietly when the holder has the permission', () => {
    expect(() => requirePermission(holder('users:read'), PERMISSIONS.USERS_READ)).not.toThrow();
  });

  it('throws ForbiddenError (403) when it does not', () => {
    const attempt = () => requirePermission(holder('tickets:create'), PERMISSIONS.USERS_READ);

    expect(attempt).toThrow(ForbiddenError);
    expect(attempt).toThrow(expect.objectContaining({ status: 403, code: 'AUTH_FORBIDDEN' }));
  });

  it('accepts a list and passes when the holder has at least one of them', () => {
    const employee = holder('tickets:read:own', 'tickets:read:assigned');

    expect(() =>
      requirePermission(employee, [PERMISSIONS.TICKETS_READ_ALL, PERMISSIONS.TICKETS_READ_OWN]),
    ).not.toThrow();
    expect(() =>
      requirePermission(employee, [PERMISSIONS.TICKETS_READ_ALL, PERMISSIONS.TICKETS_ASSIGN]),
    ).toThrow(ForbiddenError);
  });

  it('refuses everyone for an empty list, so a route with no permissions listed is closed', () => {
    expect(() => requirePermission(holder('users:read'), [])).toThrow(ForbiddenError);
  });

  it('refuses an unknown code even when the holder has it', () => {
    expect(() => requirePermission(holder('made:up'), 'made:up' as PermissionCode)).toThrow(
      ForbiddenError,
    );
  });
});
