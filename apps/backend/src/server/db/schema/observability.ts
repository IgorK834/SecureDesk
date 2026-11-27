import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Local replay metadata. The provider envelope never leaves the request. */
export const canaryWebhookReceipts = sqliteTable(
  'canary_webhook_receipts',
  {
    digest: text('digest').primaryKey(),
    receivedAt: integer('received_at').notNull(),
  },
  (t) => [index('canary_webhook_receipts_received_at_idx').on(t.receivedAt)],
);

/** Acknowledged prefix and cross-process lease for the configured Loki destination. */
export const lokiShipCursor = sqliteTable(
  'loki_ship_cursor',
  {
    id: integer('id').primaryKey(),
    destination: text('destination').notNull(),
    lastSeq: integer('last_seq').notNull(),
    lastHash: text('last_hash').notNull(),
    leaseOwner: text('lease_owner'),
    leaseUntil: integer('lease_until').notNull().default(0),
  },
  (t) => [check('loki_ship_cursor_singleton_check', sql`${t.id} = 1`)],
);
