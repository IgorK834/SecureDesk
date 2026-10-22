import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, type PermissionCode, type RoleId } from './codes';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS, ROLE_PERMISSIONS } from './matrix';

const can = (role: RoleId, permission: PermissionCode) =>
  ROLE_PERMISSIONS[role].includes(permission);

describe('role/permission matrix (backlog section 5)', () => {
  it.each([
    [ROLES.ADMINISTRATOR, 8],
    [ROLES.MANAGER, 7],
    [ROLES.EMPLOYEE, 4],
    [ROLES.GUEST, 2],
  ])('grants role %s exactly %i permissions, with none listed twice', (role, expected) => {
    expect(ROLE_PERMISSIONS[role]).toHaveLength(expected);
    expect(new Set(ROLE_PERMISSIONS[role]).size).toBe(expected);
  });

  it('lets only the Administrator manage identities and security settings', () => {
    const adminOnly = [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_BLOCK,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.USERS_RESET_PASSWORD,
      PERMISSIONS.SECURITY_SETTINGS_READ,
      PERMISSIONS.SECURITY_SETTINGS_UPDATE,
    ];

    for (const permission of adminOnly) {
      expect(can(ROLES.ADMINISTRATOR, permission)).toBe(true);
      for (const other of [ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.GUEST]) {
        expect(can(other, permission), `${other} must not have ${permission}`).toBe(false);
      }
    }
  });

  it('keeps the Administrator out of ticket content (least privilege)', () => {
    const ticketPermissions = Object.values(PERMISSIONS).filter((code) =>
      code.startsWith('tickets:'),
    );

    expect(ticketPermissions.filter((code) => can(ROLES.ADMINISTRATOR, code))).toEqual([]);
  });

  it('lets only the Manager assign tickets, read all tickets and update any ticket status', () => {
    for (const permission of [
      PERMISSIONS.TICKETS_ASSIGN,
      PERMISSIONS.TICKETS_READ_ALL,
      PERMISSIONS.TICKETS_STATUS_UPDATE_ALL,
    ]) {
      expect(can(ROLES.MANAGER, permission)).toBe(true);
      expect(can(ROLES.EMPLOYEE, permission)).toBe(false);
      expect(can(ROLES.GUEST, permission)).toBe(false);
    }
  });

  it('lets an Employee work only on assigned or own tickets, and a Guest only on own tickets', () => {
    expect(can(ROLES.EMPLOYEE, PERMISSIONS.TICKETS_READ_ASSIGNED)).toBe(true);
    expect(can(ROLES.EMPLOYEE, PERMISSIONS.TICKETS_STATUS_UPDATE_ASSIGNED)).toBe(true);
    expect(can(ROLES.GUEST, PERMISSIONS.TICKETS_READ_ASSIGNED)).toBe(false);
    expect(can(ROLES.GUEST, PERMISSIONS.TICKETS_STATUS_UPDATE_ASSIGNED)).toBe(false);
    expect(can(ROLES.GUEST, PERMISSIONS.TICKETS_READ_OWN)).toBe(true);
    expect(can(ROLES.GUEST, PERMISSIONS.TICKETS_CREATE)).toBe(true);
  });

  it('uses every permission code at least once, so none is defined but unreachable', () => {
    const granted = new Set(Object.values(ROLE_PERMISSIONS).flat());

    expect([...granted].sort()).toEqual(Object.values(PERMISSIONS).sort());
  });

  it('describes every role and permission', () => {
    expect(ROLE_DEFINITIONS.map((role) => role.id).sort()).toEqual(Object.values(ROLES).sort());
    expect(Object.keys(PERMISSION_DESCRIPTIONS).sort()).toEqual(Object.values(PERMISSIONS).sort());
    for (const description of [
      ...ROLE_DEFINITIONS.map((role) => role.description),
      ...Object.values(PERMISSION_DESCRIPTIONS),
    ]) {
      expect(description.trim()).not.toBe('');
    }
  });
});
