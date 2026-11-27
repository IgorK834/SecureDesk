import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { users } from './users';

export const auditLog = sqliteTable(
  'audit_log',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    id: text('id').notNull().unique(),
    occurredAt: text('occurred_at').notNull(),
    actorType: text('actor_type', { enum: ['USER', 'ANONYMOUS', 'SYSTEM'] }).notNull(),
    actorUserId: text('actor_user_id').references(() => users.id),
    actorLogin: text('actor_login'),
    subjectLogin: text('subject_login'),
    subjectRef: text('subject_ref'),
    ip: text('ip'),
    action: text('action').notNull(),
    description: text('description').notNull(),
    outcome: text('outcome', { enum: ['SUCCESS', 'FAILURE'] }).notNull(),
    details: text('details').notNull(),
    requestId: text('request_id').notNull(),
    prevHash: text('prev_hash').notNull(),
    entryHash: text('entry_hash').notNull(),
  },
  (t) => [
    index('audit_log_occurred_at_idx').on(t.occurredAt),
    index('audit_log_action_occurred_at_idx').on(t.action, t.occurredAt),
    index('audit_log_actor_user_id_occurred_at_idx').on(t.actorUserId, t.occurredAt),
    index('audit_log_subject_login_occurred_at_idx').on(t.subjectLogin, t.occurredAt),
    index('audit_log_subject_login_action_seq_idx').on(t.subjectLogin, t.action, t.seq),
    index('audit_log_subject_ref_occurred_at_idx').on(t.subjectRef, t.occurredAt),
    check('audit_log_actor_type_check', sql`${t.actorType} IN ('USER', 'ANONYMOUS', 'SYSTEM')`),
    check('audit_log_outcome_check', sql`${t.outcome} IN ('SUCCESS', 'FAILURE')`),
    check('audit_log_prev_hash_length_check', sql`length(${t.prevHash}) = 64`),
    check('audit_log_entry_hash_length_check', sql`length(${t.entryHash}) = 64`),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
