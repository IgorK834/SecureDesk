import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from './codes';

describe('permission and role constants', () => {
  it('defines all 26 permission codes exactly once', () => {
    const codes = Object.values(PERMISSIONS);

    expect(codes).toHaveLength(26);
    expect(new Set(codes).size).toBe(26);
    expect([...codes].sort()).toEqual(
      [
        'audit-log:export',
        'audit-log:read',
        'audit-log:verify',
        'honeytokens:read',
        'honeytokens:test',
        'ip-blocks:clear',
        'ip-blocks:read',
        'security-events:acknowledge',
        'security-events:read',
        'security-settings:read',
        'security-settings:update',
        'tickets:assign',
        'tickets:create',
        'tickets:read:all',
        'tickets:read:assigned',
        'tickets:read:own',
        'tickets:status:update:all',
        'tickets:status:update:assigned',
        'users:block',
        'users:create',
        'users:delete',
        'users:read',
        'users:reset-password',
        'users:reset-totp',
        'users:unlock',
        'users:update',
      ].sort(),
    );
  });

  it('define exactly the four variant-2 roles', () => {
    expect(Object.keys(ROLES).sort()).toEqual(['ADMINISTRATOR', 'EMPLOYEE', 'GUEST', 'MANAGER']);
    expect(new Set(Object.values(ROLES)).size).toBe(4);
  });
});
