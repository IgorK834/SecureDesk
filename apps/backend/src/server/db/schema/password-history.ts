import { randomUUID } from 'node:crypto';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { users } from './users';

/**
 * Previously used regular-password hashes, kept only to reject reuse. Hashes only: there is
 * no column that could hold an old password in plaintext.
 */
export const passwordHistory = sqliteTable(
  'password_history',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    passwordHash: text('password_hash').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
  },
  (t) => [index('password_history_user_id_idx').on(t.userId)],
);
