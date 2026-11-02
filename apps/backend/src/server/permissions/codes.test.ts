import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES } from './codes';

describe('permission and role constants', () => {
  it('define the 23 permission codes (16 of Module 1, 7 of Module 2), each exactly once', () => {
    const codes = Object.values(PERMISSIONS);

    expect(codes).toHaveLength(23);
    expect(new Set(codes).size).toBe(23);
    expect([...codes].sort()).toEqual(
      [
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
