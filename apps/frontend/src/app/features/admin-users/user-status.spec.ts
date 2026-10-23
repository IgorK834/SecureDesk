import { describe, expect, it } from 'vitest';
import { adminUser } from '../../__fixtures__/admin-users';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  hasExpiredTemporaryPassword,
  isProtectedAccount,
  userStatus,
} from './user-status';

const EXPIRES = '2030-01-01T12:00:00.000Z';
const expiry = Date.parse(EXPIRES);

describe('userStatus', () => {
  it.each([
    ['an ordinary account', { isBlocked: false, mustChangePassword: false }, 'active'],
    ['a blocked account', { isBlocked: true, mustChangePassword: false }, 'blocked'],
    [
      'an account owing its first password',
      { isBlocked: false, mustChangePassword: true },
      'pending',
    ],
    // The server counts it once, as blocked; the badge and the filter must agree.
    [
      'a blocked account that still owes its first password',
      { isBlocked: true, mustChangePassword: true },
      'blocked',
    ],
  ] as const)('puts %s in the %s state', (_name, flags, expected) => {
    expect(userStatus(flags)).toBe(expected);
  });

  it('has a distinct label for each state, so the badge never relies on colour alone', () => {
    expect(STATUS_LABELS).toStrictEqual({
      active: 'Active',
      blocked: 'Blocked',
      pending: 'Pending first login',
    });
    expect(new Set(Object.values(STATUS_LABELS)).size).toBe(3);
  });

  it('has a label for each of the four roles', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toStrictEqual([
      'ADMINISTRATOR',
      'EMPLOYEE',
      'GUEST',
      'MANAGER',
    ]);
  });
});

describe('hasExpiredTemporaryPassword', () => {
  const pending = {
    isBlocked: false,
    mustChangePassword: true,
    temporaryPasswordExpiresAt: EXPIRES,
  };

  it('is false one millisecond before the deadline and true from the deadline on', () => {
    expect(hasExpiredTemporaryPassword(pending, expiry - 1)).toBe(false);
    expect(hasExpiredTemporaryPassword(pending, expiry)).toBe(true);
    expect(hasExpiredTemporaryPassword(pending, expiry + 1)).toBe(true);
  });

  it('is false for an account that is not waiting for its first login', () => {
    expect(hasExpiredTemporaryPassword({ ...pending, mustChangePassword: false }, expiry + 1)).toBe(
      false,
    );
    expect(hasExpiredTemporaryPassword({ ...pending, isBlocked: true }, expiry + 1)).toBe(false);
  });

  it('is false when there is no deadline (the ADMIN account has none)', () => {
    expect(
      hasExpiredTemporaryPassword({ ...pending, temporaryPasswordExpiresAt: null }, expiry + 1),
    ).toBe(false);
  });

  it('uses the current time unless told otherwise', () => {
    const past = { ...pending, temporaryPasswordExpiresAt: '2000-01-01T00:00:00.000Z' };
    const future = { ...pending, temporaryPasswordExpiresAt: '2999-01-01T00:00:00.000Z' };

    expect(hasExpiredTemporaryPassword(past)).toBe(true);
    expect(hasExpiredTemporaryPassword(future)).toBe(false);
  });
});

describe('isProtectedAccount', () => {
  it.each(['ADMIN', 'admin', 'Admin', 'ＡＤＭＩＮ'])(
    'recognises %s as the permanent account',
    (login) => {
      expect(isProtectedAccount(adminUser({ login }))).toBe(true);
    },
  );

  it.each(['admin2', 'administrator', 'sysadmin', 'employee1', ''])(
    'does not treat %j as protected',
    (login) => {
      expect(isProtectedAccount(adminUser({ login }))).toBe(false);
    },
  );
});
