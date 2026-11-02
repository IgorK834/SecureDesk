import { randomUUID } from 'node:crypto';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { clock } from '../../time/clock';

/**
 * Challenges of the internal CAPTCHA provider. Only a keyed digest of the expected answer is
 * stored (`answer_mac`, HMAC-SHA256 bound to the challenge id), never the answer itself, so a
 * copy of the database does not solve any challenge. A challenge is single-use (`consumed_at`)
 * and expires (`expires_at`). Timestamps are UTC epoch milliseconds.
 */
export const captchaChallenges = sqliteTable(
  'captcha_challenges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    purpose: text('purpose').notNull(),
    answerMac: text('answer_mac').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => clock.now()),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
    ipKey: text('ip_key').notNull(),
  },
  (t) => [index('captcha_challenges_expires_at_idx').on(t.expiresAt)],
);

export type CaptchaChallengeRow = typeof captchaChallenges.$inferSelect;
