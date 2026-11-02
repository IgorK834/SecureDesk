import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { users } from './users';

/**
 * Global security settings: exactly one row, `id = 1`. Both rules below are enforced by the
 * database so no code path (including a buggy admin endpoint) can break them:
 *  - the singleton: any id other than 1, and therefore any second row, is rejected;
 *  - the variant-2 floor: the minimum password length can never drop below 12;
 *  - the login-protection settings (Module 2) stay inside the ranges the API also enforces.
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
    maxFailedLoginAttempts: integer('max_failed_login_attempts').notNull().default(5),
    ipFailedAttemptLimit: integer('ip_failed_attempt_limit').notNull().default(20),
    sprayingDistinctLoginThreshold: integer('spraying_distinct_login_threshold')
      .notNull()
      .default(8),
    securityEventRetentionDays: integer('security_event_retention_days').notNull().default(90),
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
    check(
      'security_settings_max_failed_login_attempts_check',
      sql`${t.maxFailedLoginAttempts} BETWEEN 3 AND 20`,
    ),
    check(
      'security_settings_ip_failed_attempt_limit_check',
      sql`${t.ipFailedAttemptLimit} BETWEEN 5 AND 500`,
    ),
    check(
      'security_settings_spraying_distinct_login_threshold_check',
      sql`${t.sprayingDistinctLoginThreshold} BETWEEN 3 AND 50`,
    ),
    check(
      'security_settings_security_event_retention_days_check',
      sql`${t.securityEventRetentionDays} BETWEEN 7 AND 365`,
    ),
  ],
);
