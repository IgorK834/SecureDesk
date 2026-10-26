import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { users, type UserRow } from '../db/schema';
import { toAdminUserDto, toProfile, toSafeUser } from './mappers';

const row: UserRow = {
  id: '3f0c2f0e-8a38-4c53-9b1d-0e2c6a1f9a11',
  login: 'Employee1',
  loginNormalized: 'employee1',
  firstName: 'Katarzyna',
  lastName: 'Wiśniewska',
  roleId: 'employee',
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo',
  mustChangePassword: true,
  temporaryPasswordExpiresAt: new Date('2030-01-01T12:00:00.000Z'),
  passwordChangedAt: new Date('2029-12-31T00:00:00.000Z'),
  totpSecretEncrypted: null,
  totpEnabledAt: null,
  totpLastUsedStep: null,
  isBlocked: false,
  deletedAt: new Date('2030-02-01T00:00:00.000Z'),
  createdAt: new Date('2029-12-01T00:00:00.000Z'),
  updatedAt: new Date('2029-12-02T00:00:00.000Z'),
};

// Columns that must never reach a client. A new `users` column fails the completeness test
// below until it is classified here or exposed on purpose in toSafeUser().
const WITHHELD = [
  'passwordHash',
  'deletedAt',
  'loginNormalized',
  'temporaryPasswordExpiresAt',
  'passwordChangedAt',
  'totpSecretEncrypted',
  'totpLastUsedStep',
];

describe('toSafeUser', () => {
  it('never contains a credential, a session token or the soft-delete marker', () => {
    const json = JSON.stringify(toSafeUser(row));

    for (const forbidden of ['passwordHash', 'password_hash', 'tokenHash', 'deletedAt']) {
      expect(json).not.toContain(forbidden);
    }
    expect(json).not.toContain('$argon2id$');
  });

  it('copies exactly the allowlisted fields', () => {
    expect(toSafeUser(row)).toEqual({
      id: row.id,
      login: 'Employee1',
      firstName: 'Katarzyna',
      lastName: 'Wiśniewska',
      roleId: 'employee',
      mustChangePassword: true,
      totpEnabled: false,
      isBlocked: false,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  it('ignores properties that are not on the allowlist, such as a joined or future column', () => {
    const polluted = { ...row, tokenHash: 'digest', someFutureColumn: 'x' } as unknown as UserRow;

    expect(Object.keys(toSafeUser(polluted)).sort()).toEqual(Object.keys(toSafeUser(row)).sort());
    expect(JSON.stringify(toSafeUser(polluted))).not.toMatch(/digest|someFutureColumn/);
  });

  it('accounts for every users column: each is either exposed or explicitly withheld', () => {
    const exposed = Object.keys(toSafeUser(row)).map((key) =>
      key === 'totpEnabled' ? 'totpEnabledAt' : key,
    );
    const columns = Object.keys(getTableColumns(users));

    expect([...exposed, ...WITHHELD].sort()).toEqual([...columns].sort());
  });
});

describe('toProfile', () => {
  it('copies exactly the five fields a signed-in user is shown, with the role as an upper-case code', () => {
    expect(toProfile(row)).toStrictEqual({
      id: row.id,
      login: 'Employee1',
      firstName: 'Katarzyna',
      lastName: 'Wiśniewska',
      role: 'EMPLOYEE',
    });
  });

  it('accepts a SafeUser as well as a database row', () => {
    expect(toProfile(toSafeUser(row))).toStrictEqual(toProfile(row));
  });

  it('turns every role id into its code', () => {
    const roles = ['administrator', 'manager', 'employee', 'guest'];

    expect(roles.map((roleId) => toProfile({ ...row, roleId }).role)).toStrictEqual([
      'ADMINISTRATOR',
      'MANAGER',
      'EMPLOYEE',
      'GUEST',
    ]);
  });

  it('cannot leak a credential, a flag or a joined column, however the input is polluted', () => {
    const polluted = { ...row, tokenHash: 'digest', someFutureColumn: 'x' } as unknown as UserRow;

    const json = JSON.stringify(toProfile(polluted));

    expect(Object.keys(toProfile(polluted)).sort()).toStrictEqual(
      ['firstName', 'id', 'lastName', 'login', 'role'].sort(),
    );
    expect(json).not.toMatch(
      /argon2|digest|someFutureColumn|isBlocked|mustChangePassword|deleted/i,
    );
  });
});

// The administrator's view exposes more than `toSafeUser` (the password state) but still never a
// credential. As above, a new `users` column fails the completeness test until it is classified.
const ADMIN_WITHHELD = [
  'passwordHash',
  'deletedAt',
  'loginNormalized',
  'totpSecretEncrypted',
  'totpEnabledAt',
  'totpLastUsedStep',
];

describe('toAdminUserDto', () => {
  it('copies exactly the allowlisted fields, with the role as an upper-case code', () => {
    expect(toAdminUserDto(row)).toStrictEqual({
      id: row.id,
      login: 'Employee1',
      firstName: 'Katarzyna',
      lastName: 'Wiśniewska',
      role: 'EMPLOYEE',
      isBlocked: false,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: row.temporaryPasswordExpiresAt,
      passwordChangedAt: row.passwordChangedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  });

  it('never carries a credential, a token, the normalized login or the deletion marker', () => {
    const json = JSON.stringify(toAdminUserDto(row));

    expect(json).not.toMatch(/argon2|passwordHash|password_hash|token|loginNormalized|deleted/i);
  });

  it('cannot leak a joined or future column, however the input is polluted', () => {
    const polluted = { ...row, tokenHash: 'digest', someFutureColumn: 'x' } as unknown as UserRow;

    expect(Object.keys(toAdminUserDto(polluted)).sort()).toStrictEqual(
      Object.keys(toAdminUserDto(row)).sort(),
    );
    expect(JSON.stringify(toAdminUserDto(polluted))).not.toMatch(/digest|someFutureColumn/);
  });

  it('accounts for every users column: each is either exposed or explicitly withheld', () => {
    // `roleId` is exposed as `role`.
    const exposed = Object.keys(toAdminUserDto(row)).map((key) =>
      key === 'role' ? 'roleId' : key,
    );
    const columns = Object.keys(getTableColumns(users));

    expect([...exposed, ...ADMIN_WITHHELD].sort()).toEqual([...columns].sort());
  });

  it('turns every role id into its code', () => {
    const roles = ['administrator', 'manager', 'employee', 'guest'];

    expect(roles.map((roleId) => toAdminUserDto({ ...row, roleId }).role)).toStrictEqual([
      'ADMINISTRATOR',
      'MANAGER',
      'EMPLOYEE',
      'GUEST',
    ]);
  });

  it('keeps the nullable password-state fields null rather than inventing a value', () => {
    const dto = toAdminUserDto({
      ...row,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: null,
    });

    expect(dto.temporaryPasswordExpiresAt).toBeNull();
    expect(dto.passwordChangedAt).toBeNull();
  });
});
