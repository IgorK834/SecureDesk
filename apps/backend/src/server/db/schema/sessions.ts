import { randomUUID } from 'node:crypto';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { clock } from '../../time/clock';
import { users } from './users';

export const AUTH_STAGES = [
  'INITIAL_PASSWORD_CHANGE',
  'PASSWORD_EXPIRED',
  'FULLY_AUTHENTICATED',
] as const;

export type AuthStage = (typeof AUTH_STAGES)[number];

/**
 * Server-side sessions. The browser holds the random token; the database holds only its
 * digest (`token_hash`), so a copy of the database cannot be replayed as a cookie. A session
 * is revoked by setting `revoked_at`, and `auth_stage` is what restricts a session that still
 * owes a password change (the CHECK keeps the stage set closed at the database level).
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    authStage: text('auth_stage', { enum: AUTH_STAGES }).notNull(),
  },
  (t) => [
    index('sessions_user_id_idx').on(t.userId),
    index('sessions_last_activity_at_idx').on(t.lastActivityAt),
    check(
      'sessions_auth_stage_check',
      // The values are the constants above, never user input, so sql.raw is safe here.
      sql`${t.authStage} IN (${sql.raw(AUTH_STAGES.map((stage) => `'${stage}'`).join(', '))})`,
    ),
  ],
);
