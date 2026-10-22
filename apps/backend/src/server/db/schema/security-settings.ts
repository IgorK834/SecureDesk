import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { users } from './users';

/**
 * Global security settings: exactly one row, `id = 1`. Both rules below are enforced by the
 * database so no code path (including a buggy admin endpoint) can break them:
 *  - the singleton: any id other than 1, and therefore any second row, is rejected;
 *  - the variant-2 floor: the minimum password length can never drop below 12.
 *
 * `password_max_age_days` NULL means password expiry is disabled.
 */
export const securitySettings = sqliteTable(
  'security_settings',
  {
    id: integer('id').primaryKey(),
    minPasswordLength: integer('min_password_length').notNull().default(12),
    rejectPersonalDataInPassword: integer('reject_personal_data_in_password', { mode: 'boolean' })
      .notNull()
      .default(false),
    passwordMaxAgeDays: integer('password_max_age_days'),
    sessionIdleTimeoutMinutes: integer('session_idle_timeout_minutes').notNull().default(15),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now())
      .$onUpdateFn(() => clock.now()),
    // NULL while the row still holds the seeded defaults; otherwise the administrator who changed it.
    updatedBy: text('updated_by').references(() => users.id),
  },
  (t) => [
    check('security_settings_singleton_check', sql`${t.id} = 1`),
    check('security_settings_min_password_length_check', sql`${t.minPasswordLength} >= 12`),
  ],
);
