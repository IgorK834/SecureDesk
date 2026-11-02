import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';

export const LOGIN_ATTEMPT_KINDS = [
  'CREDENTIAL',
  'PASSWORD_CHANGE',
  'CAPTCHA',
  'HONEYPOT',
  'MARKER',
] as const;
export const LOGIN_ATTEMPT_OUTCOMES = ['PENDING', 'FAILED', 'SUCCESS', 'CLEARED'] as const;

export type LoginAttemptKind = (typeof LOGIN_ATTEMPT_KINDS)[number];
export type LoginAttemptOutcome = (typeof LOGIN_ATTEMPT_OUTCOMES)[number];

/**
 * Append-only record of login attempts. Counters are derived by queries instead of mutated
 * state, so concurrent attempts cannot lose updates, an administrator's unlock is a visible
 * `CLEARED` marker and nothing is ever "reset" by deleting rows.
 *
 * `login_normalized` is whatever login was submitted, whether or not such an account exists, so
 * a lock looks the same for real and invented logins; it is NULL for IP-level rows (honeypot,
 * CAPTCHA, markers). `ip_key` is the normalized client address from `security/client-ip.ts`.
 * Old rows are purged by `maintenance/purge.ts`. Timestamps are UTC epoch milliseconds.
 */
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    loginNormalized: text('login_normalized'),
    ipKey: text('ip_key').notNull(),
    kind: text('kind', { enum: LOGIN_ATTEMPT_KINDS }).notNull(),
    outcome: text('outcome', { enum: LOGIN_ATTEMPT_OUTCOMES }).notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('login_attempts_login_occurred_idx').on(t.loginNormalized, t.occurredAt),
    index('login_attempts_ip_occurred_idx').on(t.ipKey, t.occurredAt),
    index('login_attempts_occurred_at_idx').on(t.occurredAt),
    check(
      'login_attempts_kind_check',
      sql`${t.kind} IN ('CREDENTIAL', 'PASSWORD_CHANGE', 'CAPTCHA', 'HONEYPOT', 'MARKER')`,
    ),
    check(
      'login_attempts_outcome_check',
      sql`${t.outcome} IN ('PENDING', 'FAILED', 'SUCCESS', 'CLEARED')`,
    ),
  ],
);

export type LoginAttemptRow = typeof loginAttempts.$inferSelect;
