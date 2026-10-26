import { getTableName, is } from 'drizzle-orm';
import { SQLiteTable, getTableConfig } from 'drizzle-orm/sqlite-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setClockForTests } from '../../time/clock';
import { normalizeLogin } from '../../users/login';
import {
  captureError,
  createMigratedDb,
  ensureRole,
  insertUser,
  newUserValues,
  sqliteCode,
} from '../__fixtures__/test-db';
import type { AppDb } from '../connection';
import { ConflictError, ReferenceError as DbReferenceError, mapDbError } from '../errors';
import {
  AUTH_STAGES,
  passwordHistory,
  permissions,
  rolePermissions,
  securitySettings,
  sessions,
  TICKET_STATUSES,
  tickets,
  users,
} from '.';
import * as drizzleSchema from '.';

let db: AppDb;

beforeEach(() => {
  db = createMigratedDb();
});

afterEach(() => {
  setClockForTests();
  db.$client.close();
});

const tableNames = () =>
  db.$client
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name",
    )
    .all()
    .map((row) => (row as { name: string }).name);

const columnsOf = (table: string) =>
  (db.$client.pragma(`table_info(${table})`) as { name: string; notnull: number }[]).map(
    (column) => column.name,
  );

/** Column lists of every index on a table, with whether it is unique. */
const indexesOf = (table: string) =>
  (db.$client.pragma(`index_list(${table})`) as { name: string; unique: number }[]).map(
    (index) => ({
      unique: index.unique === 1,
      columns: (db.$client.pragma(`index_info(${index.name})`) as { name: string }[]).map(
        (column) => column.name,
      ),
    }),
  );

function newSession(userId: string, overrides: Partial<typeof sessions.$inferInsert> = {}) {
  return {
    userId,
    tokenHash: 'digest-1',
    expiresAt: new Date('2030-01-01T08:00:00.000Z'),
    authStage: 'FULLY_AUTHENTICATED' as const,
    ...overrides,
  };
}

describe('migrated schema', () => {
  it('contains the seven core tables and the tickets table', () => {
    expect(tableNames()).toEqual([
      'password_history',
      'permissions',
      'role_permissions',
      'roles',
      'security_settings',
      'sessions',
      'tickets',
      'users',
    ]);
  });

  it('has the indexes the specification requires', () => {
    expect(indexesOf('users')).toContainEqual({ unique: true, columns: ['login_normalized'] });
    expect(indexesOf('sessions')).toContainEqual({ unique: true, columns: ['token_hash'] });
    expect(indexesOf('sessions')).toContainEqual({ unique: false, columns: ['user_id'] });
    expect(indexesOf('sessions')).toContainEqual({ unique: false, columns: ['last_activity_at'] });
    expect(indexesOf('password_history')).toContainEqual({ unique: false, columns: ['user_id'] });
    expect(indexesOf('permissions')).toContainEqual({ unique: true, columns: ['code'] });
    // The ticket policy filters on creator and assignee, and lists are filtered by status.
    expect(indexesOf('tickets')).toContainEqual({ unique: false, columns: ['created_by_user_id'] });
    expect(indexesOf('tickets')).toContainEqual({
      unique: false,
      columns: ['assigned_to_user_id'],
    });
    expect(indexesOf('tickets')).toContainEqual({ unique: false, columns: ['status'] });
  });
});

describe('the Drizzle schema in code matches the migrations', () => {
  // Catches the classic slip of editing a table definition without running `npm run
  // db:generate`: the application would then query columns the migrated database lacks.
  const declaredTables = () =>
    (Object.values(drizzleSchema) as unknown[])
      .filter((value): value is SQLiteTable => is(value, SQLiteTable))
      .map((table) => getTableConfig(table));

  it('declares exactly the migrated tables', () => {
    expect(
      declaredTables()
        .map((table) => table.name)
        .sort(),
    ).toEqual(tableNames());
  });

  it('declares the same columns, with the same NOT NULL-ness, as the migrated tables', () => {
    for (const table of declaredTables()) {
      const migrated = (
        db.$client.pragma(`table_info(${table.name})`) as { name: string; notnull: number }[]
      ).map((column) => `${column.name}:${column.notnull === 1}`);
      const declared = table.columns.map((column) => `${column.name}:${column.notNull}`);

      expect(declared.sort(), `table ${table.name}`).toEqual(migrated.sort());
    }
  });

  it('declares the same foreign keys as the migrated tables', () => {
    const declared = declaredTables().flatMap((table) =>
      table.foreignKeys.map((foreignKey) => {
        const { columns, foreignTable, foreignColumns } = foreignKey.reference();
        return `${table.name}.${columns.map((c) => c.name)} -> ${getTableName(foreignTable)}.${foreignColumns.map((c) => c.name)}`;
      }),
    );
    const migrated = tableNames().flatMap((table) =>
      (
        db.$client.pragma(`foreign_key_list(${table})`) as {
          from: string;
          table: string;
          to: string;
        }[]
      ).map((fk) => `${table}.${fk.from} -> ${fk.table}.${fk.to}`),
    );

    expect(declared.sort()).toEqual(migrated.sort());
    // role_permissions -> roles, role_permissions -> permissions, users -> roles,
    // password_history -> users, sessions -> users, security_settings -> users,
    // tickets -> users (creator), tickets -> users (assignee)
    expect(declared).toHaveLength(8);
  });
});

// What a column or table that holds a secret tends to be called. Broad on purpose: a false alarm
// costs one line in the lists below, a missed secret is a plaintext credential in the database.
// `pass(?!ed)` covers password, passwd and passphrase without matching "passed".
const CREDENTIAL_NAME =
  /pass(?!ed)|pwd|(^|_)pin(_|$)|(^|_)key(_|$)|(^|_)otp(_|$)|secret|token|plain|hash|digest|salt|pepper|credential|cipher|crypt|hmac|totp|mfa|recovery/i;

describe('no plaintext credentials can be stored', () => {
  // Any column whose name suggests it holds a secret must be listed here on purpose. Adding a
  // `password`, `token`, `api_key`, `pin` or similar column fails this test until a reviewer
  // decides.
  const CREDENTIAL_COLUMNS = [
    'users.password_hash',
    'users.totp_secret_encrypted',
    'password_history.password_hash',
    'sessions.token_hash',
  ];
  const NON_SECRET_METADATA = [
    'users.must_change_password',
    'users.temporary_password_expires_at',
    'users.password_changed_at',
    'users.totp_enabled_at',
    'users.totp_last_used_step',
    'security_settings.min_password_length',
    'security_settings.reject_personal_data_in_password',
    'security_settings.password_max_age_days',
  ];

  it('limits credential-like columns to password_hash and token_hash plus non-secret metadata', () => {
    const credentialLike = tableNames().flatMap((table) =>
      columnsOf(table)
        .filter((column) => CREDENTIAL_NAME.test(column))
        .map((column) => `${table}.${column}`),
    );

    expect([...credentialLike].sort()).toEqual(
      [...CREDENTIAL_COLUMNS, ...NON_SECRET_METADATA].sort(),
    );
  });

  it('has no table that looks like it keeps credentials, other than the password history', () => {
    expect(tableNames().filter((table) => CREDENTIAL_NAME.test(table))).toEqual([
      'password_history',
    ]);
  });

  // Guards the guard: a pattern that matched nothing new would let the tests above pass forever.
  it.each([
    'password',
    'passwd',
    'pwd',
    'passphrase',
    'token_hash',
    'user_pin',
    'api_key',
    'private_key',
    'key',
    'credential',
    'otp_code',
    'totp_seed',
    'recovery_code',
    'digest',
    'hmac_value',
    'cipher_text',
    'mfa_secret',
  ])('treats a column called %s as credential-like', (name) => {
    expect(CREDENTIAL_NAME.test(name)).toBe(true);
  });

  it.each([
    'id',
    'login',
    'first_name',
    'created_at',
    'auth_stage',
    'role_id',
    'status',
    'title',
    'description',
    'assigned_to_user_id',
    'expires_at',
    'updated_by',
    'is_blocked',
    'deleted_at',
    'code',
    'name',
    'last_activity_at',
    'login_normalized',
  ])('does not treat a column called %s as credential-like', (name) => {
    expect(CREDENTIAL_NAME.test(name)).toBe(false);
  });

  it('stores every credential as text in an explicitly hash-or-encrypted column', () => {
    for (const qualified of CREDENTIAL_COLUMNS) {
      const [table, column] = qualified.split('.') as [string, string];
      const info = db.$client.pragma(`table_info(${table})`) as { name: string; type: string }[];

      expect(column).toMatch(/(?:_hash|_encrypted)$/);
      expect(info.find((candidate) => candidate.name === column)?.type.toLowerCase()).toBe('text');
    }
  });
});

describe('users', () => {
  it('rejects a user without a role (role_id is NOT NULL)', () => {
    const withoutRole: Partial<typeof users.$inferInsert> = newUserValues();
    delete withoutRole.roleId;

    const error = captureError(() =>
      db
        .insert(users)
        .values(withoutRole as never)
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_NOTNULL');
  });

  it('rejects a user whose role does not exist (the foreign key is enforced)', () => {
    const error = captureError(() =>
      db
        .insert(users)
        .values(newUserValues({ roleId: 'no-such-role' }))
        .run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
  });

  it('accepts a user with a valid role', () => {
    const id = insertUser(db, { roleId: ensureRole(db, 'manager') });

    expect(db.select().from(users).all()).toMatchObject([{ id, roleId: 'manager' }]);
  });

  it.each([
    ['letter case', 'EMPLOYEE1'],
    ['Unicode compatibility form (full-width letters)', 'ＥＭＰＬＯＹＥＥ１'],
  ])('rejects a second login that differs only by %s', (_label, variant) => {
    insertUser(db, { login: 'employee1' });

    const error = captureError(() =>
      db
        .insert(users)
        .values(newUserValues({ login: variant }))
        .run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(ConflictError);
  });

  it('rejects an accent written decomposed when the composed form already exists', () => {
    insertUser(db, { login: 'Zo\u00e9' });

    const error = captureError(() =>
      db
        .insert(users)
        .values(newUserValues({ login: 'Zoe\u0301' }))
        .run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(ConflictError);
  });

  it('keeps the login spelling and allows genuinely different logins', () => {
    insertUser(db, { login: 'Employee1' });
    insertUser(db, { login: 'employee2' });

    expect(
      db
        .select({ login: users.login, normalized: users.loginNormalized })
        .from(users)
        .orderBy(users.login)
        .all(),
    ).toEqual([
      { login: 'Employee1', normalized: normalizeLogin('Employee1') },
      { login: 'employee2', normalized: 'employee2' },
    ]);
  });

  it('applies the documented defaults: a UUID id, not blocked, not deleted', () => {
    insertUser(db);

    const [row] = db.select().from(users).all();

    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(row).toMatchObject({
      isBlocked: false,
      deletedAt: null,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: null,
    });
  });

  it('stores timestamps as UTC epoch milliseconds taken from the injectable clock', () => {
    setClockForTests({ now: () => new Date('2030-01-02T03:04:05.678Z') });
    insertUser(db, { temporaryPasswordExpiresAt: new Date('2030-01-02T15:04:05.678Z') });

    const raw = db.$client
      .prepare(
        'SELECT created_at, typeof(created_at) AS created_type, temporary_password_expires_at AS expires FROM users',
      )
      .get();

    expect(raw).toEqual({
      created_at: Date.parse('2030-01-02T03:04:05.678Z'),
      created_type: 'integer',
      expires: Date.parse('2030-01-02T15:04:05.678Z'),
    });
  });

  it('refreshes updated_at on update without touching created_at', () => {
    setClockForTests({ now: () => new Date('2030-01-01T00:00:00.000Z') });
    const id = insertUser(db);
    setClockForTests({ now: () => new Date('2030-01-01T06:00:00.000Z') });

    db.update(users).set({ firstName: 'Changed' }).run();

    const [row] = db.select().from(users).all();
    expect(row).toMatchObject({
      id,
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2030-01-01T06:00:00.000Z'),
    });
  });
});

describe('roles, permissions and role_permissions', () => {
  it('rejects a duplicate permission code even under a different id', () => {
    db.insert(permissions).values({ id: 'a', code: 'users:read', description: 'x' }).run();

    const error = captureError(() =>
      db.insert(permissions).values({ id: 'b', code: 'users:read', description: 'y' }).run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(ConflictError);
  });

  it('rejects the same role/permission link twice (composite primary key)', () => {
    const roleId = ensureRole(db, 'manager');
    db.insert(permissions).values({ id: 'users:read', code: 'users:read', description: 'x' }).run();
    const link = { roleId, permissionId: 'users:read' };
    db.insert(rolePermissions).values(link).run();

    const error = captureError(() => db.insert(rolePermissions).values(link).run());

    expect(mapDbError(error)).toBeInstanceOf(ConflictError);
  });

  it('rejects a link to a role or permission that does not exist', () => {
    db.insert(permissions).values({ id: 'users:read', code: 'users:read', description: 'x' }).run();

    const error = captureError(() =>
      db.insert(rolePermissions).values({ roleId: 'ghost', permissionId: 'users:read' }).run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
  });
});

describe('sessions', () => {
  it.each(AUTH_STAGES)('accepts the auth stage %s', (authStage) => {
    const userId = insertUser(db);

    db.insert(sessions).values(newSession(userId, { authStage })).run();

    expect(db.select({ stage: sessions.authStage }).from(sessions).all()).toEqual([
      { stage: authStage },
    ]);
  });

  it('rejects any other auth stage at the database level', () => {
    const userId = insertUser(db);

    const error = captureError(() =>
      db
        .insert(sessions)
        .values(newSession(userId, { authStage: 'ADMIN' as never }))
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('rejects a second session with the same token digest', () => {
    const userId = insertUser(db);
    db.insert(sessions).values(newSession(userId)).run();

    const error = captureError(() => db.insert(sessions).values(newSession(userId)).run());

    expect(mapDbError(error)).toBeInstanceOf(ConflictError);
  });

  it('rejects a session for a user that does not exist', () => {
    const error = captureError(() => db.insert(sessions).values(newSession('ghost-user')).run());

    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
  });

  it('can be revoked: revoked_at is empty until set, and the row is kept', () => {
    const userId = insertUser(db);
    db.insert(sessions).values(newSession(userId)).run();
    expect(db.select().from(sessions).all()[0]?.revokedAt).toBeNull();

    const revokedAt = new Date('2030-01-01T01:00:00.000Z');
    db.update(sessions).set({ revokedAt }).run();

    expect(db.select().from(sessions).all()[0]?.revokedAt).toEqual(revokedAt);
  });

  it('defaults created_at and last_activity_at from the clock', () => {
    setClockForTests({ now: () => new Date('2030-03-03T03:03:03.000Z') });
    const userId = insertUser(db);

    db.insert(sessions).values(newSession(userId)).run();

    expect(db.select().from(sessions).all()[0]).toMatchObject({
      createdAt: new Date('2030-03-03T03:03:03.000Z'),
      lastActivityAt: new Date('2030-03-03T03:03:03.000Z'),
    });
  });
});

describe('password_history', () => {
  it('belongs to an existing user and records a hash', () => {
    const userId = insertUser(db);
    db.insert(passwordHistory).values({ userId, passwordHash: 'old-hash' }).run();

    expect(db.select().from(passwordHistory).all()).toMatchObject([
      { userId, passwordHash: 'old-hash' },
    ]);

    const error = captureError(() =>
      db.insert(passwordHistory).values({ userId: 'ghost', passwordHash: 'h' }).run(),
    );
    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
  });
});

describe('security_settings', () => {
  it('accepts the default row: length 12, personal-data rule off, expiry disabled, 15 minutes idle', () => {
    db.insert(securitySettings).values({ id: 1 }).run();

    expect(db.select().from(securitySettings).all()).toMatchObject([
      {
        id: 1,
        minPasswordLength: 12,
        rejectPersonalDataInPassword: false,
        passwordMaxAgeDays: null,
        sessionIdleTimeoutMinutes: 15,
        updatedBy: null,
      },
    ]);
  });

  it('rejects min_password_length = 11 (the variant-2 floor) on insert and on update', () => {
    const onInsert = captureError(() =>
      db.insert(securitySettings).values({ id: 1, minPasswordLength: 11 }).run(),
    );
    expect(sqliteCode(onInsert)).toBe('SQLITE_CONSTRAINT_CHECK');

    db.insert(securitySettings).values({ id: 1, minPasswordLength: 12 }).run();
    const onUpdate = captureError(() =>
      db.update(securitySettings).set({ minPasswordLength: 11 }).run(),
    );
    expect(sqliteCode(onUpdate)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('allows raising the minimum above 12', () => {
    db.insert(securitySettings).values({ id: 1 }).run();

    db.update(securitySettings).set({ minPasswordLength: 16 }).run();

    expect(db.select().from(securitySettings).all()[0]?.minPasswordLength).toBe(16);
  });

  it('refuses a second row: a different id fails the singleton CHECK, the same id the primary key', () => {
    db.insert(securitySettings).values({ id: 1 }).run();

    const otherId = captureError(() => db.insert(securitySettings).values({ id: 2 }).run());
    const sameId = captureError(() => db.insert(securitySettings).values({ id: 1 }).run());

    expect(sqliteCode(otherId)).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(mapDbError(sameId)).toBeInstanceOf(ConflictError);
    expect(db.select().from(securitySettings).all()).toHaveLength(1);
  });

  it('records which user changed the settings, and only an existing one', () => {
    const adminId = insertUser(db);
    db.insert(securitySettings).values({ id: 1, updatedBy: adminId }).run();
    expect(db.select().from(securitySettings).all()[0]?.updatedBy).toBe(adminId);

    const error = captureError(() =>
      db.update(securitySettings).set({ updatedBy: 'ghost-user' }).run(),
    );
    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
  });
});

describe('tickets', () => {
  const newTicket = (
    createdByUserId: string,
    overrides: Partial<typeof tickets.$inferInsert> = {},
  ) => ({
    title: 'Printer is broken',
    description: 'It prints blank pages.',
    createdByUserId,
    ...overrides,
  });

  it.each(TICKET_STATUSES)('accepts the status %s', (status) => {
    const creator = insertUser(db);

    db.insert(tickets).values(newTicket(creator, { status })).run();

    expect(db.select({ status: tickets.status }).from(tickets).all()).toEqual([{ status }]);
  });

  it.each(['CLOSED', 'open', ''])('rejects the status %j at the database level', (status) => {
    const creator = insertUser(db);

    const error = captureError(() =>
      db
        .insert(tickets)
        .values(newTicket(creator, { status: status as never }))
        .run(),
    );

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
  });

  it('starts a ticket as OPEN and unassigned, with a UUID id and timestamps from the clock', () => {
    setClockForTests({ now: () => new Date('2030-03-03T03:03:03.000Z') });
    const creator = insertUser(db);

    db.insert(tickets).values(newTicket(creator)).run();
    const [row] = db.select().from(tickets).all();

    expect(row?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(row).toMatchObject({
      status: 'OPEN',
      createdByUserId: creator,
      assignedToUserId: null,
      createdAt: new Date('2030-03-03T03:03:03.000Z'),
      updatedAt: new Date('2030-03-03T03:03:03.000Z'),
    });
  });

  it('refuses a ticket without a creator and one whose creator does not exist', () => {
    const missing = captureError(() =>
      db
        .insert(tickets)
        .values({ title: 't', description: 'd' } as never)
        .run(),
    );
    const ghost = captureError(() => db.insert(tickets).values(newTicket('ghost-user')).run());

    expect(sqliteCode(missing)).toBe('SQLITE_CONSTRAINT_NOTNULL');
    expect(mapDbError(ghost)).toBeInstanceOf(DbReferenceError);
  });

  it('refuses an assignee that does not exist, but allows having none', () => {
    const creator = insertUser(db);
    db.insert(tickets)
      .values(newTicket(creator, { assignedToUserId: null }))
      .run();

    const error = captureError(() =>
      db
        .insert(tickets)
        .values(newTicket(creator, { assignedToUserId: 'ghost-user' }))
        .run(),
    );

    expect(mapDbError(error)).toBeInstanceOf(DbReferenceError);
    expect(db.select().from(tickets).all()).toHaveLength(1);
  });

  it('keeps creator and assignee apart: they may be different users, or the same one', () => {
    const creator = insertUser(db, { login: 'guest1' });
    const employee = insertUser(db, { login: 'employee1' });

    db.insert(tickets)
      .values(newTicket(creator, { assignedToUserId: employee }))
      .run();
    db.insert(tickets)
      .values(newTicket(employee, { assignedToUserId: employee }))
      .run();

    expect(
      db.select({ by: tickets.createdByUserId, to: tickets.assignedToUserId }).from(tickets).all(),
    ).toEqual([
      { by: creator, to: employee },
      { by: employee, to: employee },
    ]);
  });

  it('refreshes updated_at when the status changes, without touching created_at', () => {
    setClockForTests({ now: () => new Date('2030-01-01T00:00:00.000Z') });
    const creator = insertUser(db);
    db.insert(tickets).values(newTicket(creator)).run();
    setClockForTests({ now: () => new Date('2030-01-01T06:00:00.000Z') });

    db.update(tickets).set({ status: 'RESOLVED' }).run();

    expect(db.select().from(tickets).all()[0]).toMatchObject({
      status: 'RESOLVED',
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
      updatedAt: new Date('2030-01-01T06:00:00.000Z'),
    });
  });
});
