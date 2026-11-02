import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { honeytokens } from './honeytokens';
import { users } from './users';

export const SECURITY_EVENT_SEVERITIES = ['INFO', 'WARNING', 'CRITICAL'] as const;
export const ALERT_STATUSES = ['NONE', 'PENDING', 'SENT', 'FAILED', 'SUPPRESSED'] as const;

export type SecurityEventSeverity = (typeof SECURITY_EVENT_SEVERITIES)[number];
export type AlertStatus = (typeof ALERT_STATUSES)[number];

/**
 * Persistent audit trail of security-relevant events (lockouts, bot detections, honeytoken hits).
 * `type` is validated in code against the registry in `security/events.ts`, which also fixes the
 * severity and the shape of `details` (JSON text). Nothing secret is stored here: no password,
 * hash, token, CAPTCHA response or answer. `ip_key` and `user_agent` (cut to 200 characters) are
 * personal data, so rows are purged after `security_settings.security_event_retention_days`.
 * Timestamps are UTC epoch milliseconds.
 */
export const securityEvents = sqliteTable(
  'security_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    type: text('type').notNull(),
    severity: text('severity', { enum: SECURITY_EVENT_SEVERITIES }).notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    ipKey: text('ip_key'),
    userAgent: text('user_agent'),
    loginNormalized: text('login_normalized'),
    userId: text('user_id').references(() => users.id),
    honeytokenId: text('honeytoken_id').references(() => honeytokens.id),
    details: text('details').notNull(),
    requestId: text('request_id').notNull(),
    acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp_ms' }),
    acknowledgedBy: text('acknowledged_by').references(() => users.id),
    alertStatus: text('alert_status', { enum: ALERT_STATUSES }).notNull().default('NONE'),
    alertAttemptedAt: integer('alert_attempted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('security_events_occurred_at_idx').on(t.occurredAt),
    index('security_events_severity_acknowledged_idx').on(t.severity, t.acknowledgedAt),
    index('security_events_type_idx').on(t.type),
    check('security_events_severity_check', sql`${t.severity} IN ('INFO', 'WARNING', 'CRITICAL')`),
    check(
      'security_events_alert_status_check',
      sql`${t.alertStatus} IN ('NONE', 'PENDING', 'SENT', 'FAILED', 'SUPPRESSED')`,
    ),
  ],
);

export type SecurityEventRow = typeof securityEvents.$inferSelect;
