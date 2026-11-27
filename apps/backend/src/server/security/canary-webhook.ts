import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { canonicalDetails } from '../audit/chain';
import { systemAudit } from '../audit/context';
import type { AppDb } from '../db/connection';
import { canaryWebhookReceipts, honeytokens } from '../db/schema';
import { ApiError, NotFoundError } from '../http/errors';
import { clock } from '../time/clock';
import { stageSecurityEvent } from './events';
import { SlidingWindowRateLimiter } from './rate-limiter';

const replayWindow = 5 * 60_000;
const rateLimiter = new SlidingWindowRateLimiter(clock);
const source = 'CANARYTOKENS_WEBHOOK';
const time = z.iso.datetime({ local: true, offset: true });

// Validate the fields used to identify a delivery and strip provider-specific extras.
export const CanaryWebhookBody = z.union([
  z.object({
    memo: z.literal('Congrats! The newly saved webhook works'),
    token: z.literal('a+test+token'),
    time,
  }),
  z.object({
    memo: z.string().regex(/^securedesk:[a-zA-Z0-9_-]{1,128}$/),
    time,
    token: z.string().max(256).optional(),
    src_ip: z.string().max(64).nullable().optional(),
    channel: z.string().max(64).optional(),
    token_type: z.string().max(64).optional(),
  }),
]);

const digest = (value: string) => createHash('sha256').update(value).digest();
export function authenticateCanaryWebhook(
  params: Record<string, string | string[] | undefined> | undefined,
): void {
  const configured = process.env.CANARYTOKENS_WEBHOOK_SECRET?.trim() ?? '';
  const presented = typeof params?.secret === 'string' ? params.secret : '';
  const matches = timingSafeEqual(digest(configured), digest(presented));
  if (!configured || !matches) throw new NotFoundError();

  const decision = rateLimiter.consume('canary-webhook', 60, 60_000);
  if (!decision.allowed) {
    throw new ApiError(429, 'TOO_MANY_REQUESTS', 'Zbyt wiele żądań', undefined, {
      'Retry-After': String(decision.retryAfterSeconds),
    });
  }
}

export function receiveCanaryWebhook(
  db: AppDb,
  body: z.output<typeof CanaryWebhookBody>,
  requestId: string,
): void {
  if (body.memo === 'Congrats! The newly saved webhook works') return;
  const id = body.memo.slice('securedesk:'.length);
  const receipt = createHmac('sha256', process.env.CANARYTOKENS_WEBHOOK_SECRET!.trim())
    .update(canonicalDetails(body))
    .digest('hex');
  const now = clock.now();
  const event = db.transaction(
    (tx) => {
      const trap = tx.select().from(honeytokens).where(eq(honeytokens.id, id)).get();
      if (!trap?.enabled) throw new NotFoundError();
      tx.delete(canaryWebhookReceipts)
        .where(lte(canaryWebhookReceipts.receivedAt, now.getTime() - replayWindow))
        .run();
      const saved = tx
        .insert(canaryWebhookReceipts)
        .values({ digest: receipt, receivedAt: now.getTime() })
        .onConflictDoNothing()
        .run();
      if (!saved.changes) return;

      tx.update(honeytokens)
        .set({
          lastTriggeredAt: now,
          triggerCount: sql`${honeytokens.triggerCount} + 1`,
        })
        .where(eq(honeytokens.id, id))
        .run();
      const details = { trapKind: trap.kind, source } as const;
      systemAudit(requestId).record(tx, {
        action: 'HONEYTOKEN_ALERT_RECEIVED',
        outcome: 'SUCCESS',
        details,
      });
      return stageSecurityEvent(tx, {
        type: 'HONEYTOKEN_TRIGGERED',
        details,
        requestId,
        honeytokenId: trap.id,
        loginNormalized: trap.loginNormalized,
      });
    },
    { behavior: 'immediate' },
  );
  event?.afterCommit(db);
}
