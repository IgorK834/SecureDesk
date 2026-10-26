import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';
import { users } from './users';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

/**
 * Support tickets. Who may see or change one is decided by `server/tickets/policy.ts`, which
 * looks at `created_by_user_id` and `assigned_to_user_id`; that is why both are indexed, as is
 * `status` (the CHECK keeps the set of statuses closed at the database level).
 *
 * `title` and `description` are plain text. They are stored exactly as sent and are never
 * interpreted as HTML by the API.
 *
 * Users are soft-deleted, never removed, so both foreign keys always point at a real row.
 */
export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: TICKET_STATUSES }).notNull().default('OPEN'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    assignedToUserId: text('assigned_to_user_id').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now())
      .$onUpdateFn(() => clock.now()),
  },
  (t) => [
    index('tickets_created_by_user_id_idx').on(t.createdByUserId),
    index('tickets_assigned_to_user_id_idx').on(t.assignedToUserId),
    index('tickets_status_idx').on(t.status),
    check('tickets_status_check', sql`${t.status} IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')`),
  ],
);

export type TicketRow = typeof tickets.$inferSelect;
