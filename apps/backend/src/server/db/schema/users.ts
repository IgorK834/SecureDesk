import { randomUUID } from 'node:crypto';
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { roles } from './roles';

/**
 * Accounts. A user has exactly one role (`role_id` is NOT NULL with an enforced foreign key)
 * and the only credential column is `password_hash` (an Argon2id encoded hash, never a
 * password). Accounts are soft-deleted (`deleted_at`), never removed, so sessions, history
 * and tickets keep a valid owner.
 *
 * Uniqueness of the login is enforced on `login_normalized`, which callers fill with
 * normalizeLogin(login); `login` keeps the spelling the user was created with.
 *
 * Timestamps are UTC epoch milliseconds.
 */
export const users = sqliteTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    login: text('login').notNull(),
    loginNormalized: text('login_normalized').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    roleId: text('role_id')
      .notNull()
      .references(() => roles.id),
    passwordHash: text('password_hash').notNull(),
    mustChangePassword: integer('must_change_password', { mode: 'boolean' }).notNull(),
    temporaryPasswordExpiresAt: integer('temporary_password_expires_at', { mode: 'timestamp_ms' }),
    passwordChangedAt: integer('password_changed_at', { mode: 'timestamp_ms' }),
    isBlocked: integer('is_blocked', { mode: 'boolean' }).notNull().default(false),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now())
      .$onUpdateFn(() => clock.now()),
  },
  (t) => [uniqueIndex('users_login_normalized_unique').on(t.loginNormalized)],
);

export type UserRow = typeof users.$inferSelect;
