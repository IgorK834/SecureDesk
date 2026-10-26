import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from './codes';

describe('permission and role constants', () => {
  it('define the 16 permission codes including optional TOTP recovery, each exactly once', () => {
    const codes = Object.values(PERMISSIONS);

    expect(codes).toHaveLength(16);
    expect(new Set(codes).size).toBe(16);
    expect([...codes].sort()).toEqual(
      [
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
        'users:update',
      ].sort(),
    );
  });

  it('define exactly the four variant-2 roles', () => {
    expect(Object.keys(ROLES).sort()).toEqual(['ADMINISTRATOR', 'EMPLOYEE', 'GUEST', 'MANAGER']);
    expect(new Set(Object.values(ROLES)).size).toBe(4);
  });
});
