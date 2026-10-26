import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLES, type PermissionCode, type RoleId } from './codes';
import { PERMISSION_DESCRIPTIONS, ROLE_DEFINITIONS, ROLE_PERMISSIONS } from './matrix';

const can = (role: RoleId, permission: PermissionCode) =>
  ROLE_PERMISSIONS[role].includes(permission);

const codesOf = (role: RoleId) => [...ROLE_PERMISSIONS[role]];
const startingWith = (role: RoleId, ...prefixes: string[]) =>
  codesOf(role).filter((code) => prefixes.some((prefix) => code.startsWith(prefix)));

// The expected sets are typed out as plain strings on purpose: they do not go through
// PERMISSIONS, so a wrong constant value, an added grant or a dropped grant makes these fail
// instead of silently agreeing with itself. A change to the matrix must change this test too.
describe('exact permission set of each role (backlog section 5, least privilege)', () => {
  it('Administrator manages identities and security settings, and nothing else', () => {
    expect(codesOf(ROLES.ADMINISTRATOR).sort()).toEqual(
      [
        'users:read',
        'users:create',
        'users:update',
        'users:block',
        'users:delete',
        'users:reset-password',
        'users:reset-totp',
        'security-settings:read',
        'security-settings:update',
      ].sort(),
    );
  });

  it('Manager coordinates tickets and has no say over accounts or settings', () => {
    expect(codesOf(ROLES.MANAGER).sort()).toEqual(
      [
        'tickets:create',
        'tickets:read:all',
        'tickets:read:assigned',
        'tickets:read:own',
        'tickets:assign',
        'tickets:status:update:all',
        'tickets:status:update:assigned',
      ].sort(),
    );
  });

  it('Employee works on assigned and own tickets only', () => {
    expect(codesOf(ROLES.EMPLOYEE).sort()).toEqual(
      [
        'tickets:create',
        'tickets:read:assigned',
        'tickets:read:own',
        'tickets:status:update:assigned',
      ].sort(),
    );
  });

  it('Guest can only file a ticket and read their own', () => {
    expect(codesOf(ROLES.GUEST).sort()).toEqual(['tickets:create', 'tickets:read:own'].sort());
  });

  it('Guest holds no code that starts with users: or security-settings:', () => {
    expect(startingWith(ROLES.GUEST, 'users:', 'security-settings:')).toEqual([]);
  });

  it('Employee cannot assign tickets', () => {
    expect(codesOf(ROLES.EMPLOYEE)).not.toContain('tickets:assign');
  });

  it('Manager holds no users:* code', () => {
    expect(startingWith(ROLES.MANAGER, 'users:')).toEqual([]);
  });

  it('Administrator holds no tickets:* code, so the role alone never opens ticket content', () => {
    expect(startingWith(ROLES.ADMINISTRATOR, 'tickets:')).toEqual([]);
  });

  it('grants nothing outside the 16 defined codes (a typo in the matrix would be caught here)', () => {
    const defined = new Set<string>(Object.values(PERMISSIONS));

    for (const role of Object.values(ROLES)) {
      expect(
        codesOf(role).filter((code) => !defined.has(code)),
        role,
      ).toEqual([]);
    }
  });
});

describe('role/permission matrix (backlog section 5)', () => {
  it.each([
    [ROLES.ADMINISTRATOR, 9],
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
      PERMISSIONS.USERS_RESET_TOTP,
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
