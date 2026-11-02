import { type SQL, type SQLWrapper, and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { users } from '../db/schema';
import { NotFoundError } from '../http/errors';
import { accountLockedUntil } from '../security/attempt-tracker';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';
import { normalizeLogin } from './login';
import { type AdminUserDto, toAdminUserDto } from './mappers';
import { type RoleCode, type UserStatus, roleIdOf } from './schemas';

// Reading accounts for the administrator. Every query here is built with Drizzle's operators or a
// `sql` template, so every value (the search text included) travels as a bound parameter and is
// never part of the SQL text. Soft-deleted accounts are excluded from all of them.

/** What the functions need from a database; a transaction handle qualifies too. */
type QueryDb = Pick<AppDb, 'select'>;

/**
 * The columns of an `AdminUserDto`, and nothing else. Selecting them by name (never the whole
 * row) means the password hash is not even loaded into memory on these paths.
 */
export const ADMIN_USER_COLUMNS = {
  id: users.id,
  login: users.login,
  firstName: users.firstName,
  lastName: users.lastName,
  roleId: users.roleId,
  isBlocked: users.isBlocked,
  mustChangePassword: users.mustChangePassword,
  temporaryPasswordExpiresAt: users.temporaryPasswordExpiresAt,
  passwordChangedAt: users.passwordChangedAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/** Makes `\`, `%` and `_` literal characters inside a LIKE pattern (with `ESCAPE '\'`). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

/** `column` contains `text` literally. SQLite's LIKE ignores case for ASCII letters only. */
const containing = (column: SQLWrapper, text: string): SQL =>
  sql`${column} LIKE ${`%${escapeLike(text)}%`} ESCAPE '\\'`;

function statusOf(user: AdminUserDto): UserStatus {
  if (user.isBlocked) return 'blocked';
  if (user.lockedUntil) return 'locked';
  return user.mustChangePassword ? 'pending' : 'active';
}

export interface ListUsersInput {
  /** Matches the login, first name or last name. */
  q?: string | undefined;
  role?: RoleCode | undefined;
  status?: UserStatus | undefined;
  page: number;
  pageSize: number;
}

/**
 * One page of accounts, ordered by login, with the number of accounts that match in all. The
 * login is compared in its normalized form, like everywhere else a login is looked up, so
 * `EMPLOYEE` finds `employee1`; the names are compared as typed.
 */
export function listUsers(
  db: QueryDb,
  { q, role, status, page, pageSize }: ListUsersInput,
): { items: AdminUserDto[]; total: number } {
  const where = and(
    isNull(users.deletedAt),
    q
      ? or(
          containing(users.loginNormalized, normalizeLogin(q)),
          containing(users.firstName, q),
          containing(users.lastName, q),
        )
      : undefined,
    role ? eq(users.roleId, roleIdOf(role)) : undefined,
  );

  const rows = db
    .select(ADMIN_USER_COLUMNS)
    .from(users)
    .where(where)
    .orderBy(asc(users.loginNormalized), asc(users.id))
    .all();
  const now = clock.now();
  const maxAttempts = readSecuritySettings(db).maxFailedLoginAttempts;
  const matching = rows
    .map((row) =>
      toAdminUserDto(
        row,
        accountLockedUntil(db, normalizeLogin(row.login), now, maxAttempts) ?? null,
      ),
    )
    .filter((user) => !status || statusOf(user) === status);
  const offset = (page - 1) * pageSize;

  return { items: matching.slice(offset, offset + pageSize), total: matching.length };
}

/** One account, or "not found" when there is none or it was deleted. */
export function getUser(db: QueryDb, id: string): AdminUserDto {
  const row = db
    .select(ADMIN_USER_COLUMNS)
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .get();
  if (!row) throw new NotFoundError();
  const maxAttempts = readSecuritySettings(db).maxFailedLoginAttempts;
  return toAdminUserDto(
    row,
    accountLockedUntil(db, normalizeLogin(row.login), clock.now(), maxAttempts) ?? null,
  );
}
