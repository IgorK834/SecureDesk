// Helpers for tests that exercise the real schema. Excluded from coverage (see __fixtures__).
import { normalizeLogin } from '../../users/login';
import { ROLES } from '../../permissions/codes';
import { type AppDb, createDb } from '../connection';
import { runMigrations } from '../migrate';
import { roles, users } from '../schema';

/** A fresh in-memory database with the real migrations applied and foreign keys enforced. */
export function createMigratedDb(): AppDb {
  const db = createDb(':memory:');
  runMigrations(db);
  return db;
}

/** Inserts a role if it is not there yet and returns its id. */
export function ensureRole(db: AppDb, id: string = ROLES.EMPLOYEE): string {
  db.insert(roles)
    .values({ id, name: id, description: `${id} role` })
    .onConflictDoNothing()
    .run();
  return id;
}

/** A complete, valid users row. `loginNormalized` follows `login` unless overridden. */
export function newUserValues(
  overrides: Partial<typeof users.$inferInsert> = {},
): typeof users.$inferInsert {
  const login = overrides.login ?? 'employee1';
  return {
    login,
    loginNormalized: normalizeLogin(login),
    firstName: 'Test',
    lastName: 'User',
    roleId: ROLES.EMPLOYEE,
    passwordHash: 'test-only-hash',
    mustChangePassword: false,
    ...overrides,
  };
}

/** Inserts a user (creating its role if needed) and returns the stored id. */
export function insertUser(db: AppDb, overrides: Partial<typeof users.$inferInsert> = {}): string {
  const values = newUserValues(overrides);
  ensureRole(db, values.roleId);
  const [row] = db.insert(users).values(values).returning({ id: users.id }).all();
  if (!row) throw new Error('insert returned no row');
  return row.id;
}

/** Runs `action`, which must throw, and returns what it threw. */
export function captureError(action: () => unknown): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected the statement to fail');
}

/** The SQLite error code of a Drizzle error (Drizzle may keep it on `cause`). */
export function sqliteCode(error: unknown): string | undefined {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return code ?? cause?.code;
}
