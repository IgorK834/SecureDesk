import { sql } from 'drizzle-orm';
import { check, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';

export const HONEYTOKEN_KINDS = ['ACCOUNT_TRAP', 'AWS_KEYS'] as const;

export type HoneytokenKind = (typeof HONEYTOKEN_KINDS)[number];

/**
 * Registry of planted traps. Any use of one is an incident, because no legitimate flow touches
 * it. `login_normalized` is set for an account trap only (a login that has no user row) and is
 * unique, so one login cannot be two traps. `alert_url_env` holds the NAME of the environment
 * variable with the Canarytokens URL: the URL itself is a secret and never enters the database.
 * Timestamps are UTC epoch milliseconds.
 */
export const honeytokens = sqliteTable(
  'honeytokens',
  {
    id: text('id').primaryKey(),
    kind: text('kind', { enum: HONEYTOKEN_KINDS }).notNull(),
    label: text('label').notNull(),
    loginNormalized: text('login_normalized'),
    alertUrlEnv: text('alert_url_env'),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp_ms' }),
    triggerCount: integer('trigger_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('honeytokens_login_normalized_unique').on(t.loginNormalized),
    check('honeytokens_kind_check', sql`${t.kind} IN ('ACCOUNT_TRAP', 'AWS_KEYS')`),
  ],
);

export type HoneytokenRow = typeof honeytokens.$inferSelect;
