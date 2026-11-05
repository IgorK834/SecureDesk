import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/connection';
import { honeytokens } from '../db/schema';
import { NotFoundError } from '../http/errors';
import { registerAlertDispatcher } from './alerts';
import { recordSecurityEvent } from './events';
import { CanarytokensDispatcher } from './honeytokens';
import { WebhookAlertDispatcher } from './webhook-alerts';

export const HoneytokenParams = z.strictObject({ id: z.string().min(1).max(100) });

const SAFE_COLUMNS = {
  id: honeytokens.id,
  kind: honeytokens.kind,
  label: honeytokens.label,
  enabled: honeytokens.enabled,
  lastTriggeredAt: honeytokens.lastTriggeredAt,
  triggerCount: honeytokens.triggerCount,
} as const;

export function listHoneytokens(db: AppDb) {
  return db
    .select(SAFE_COLUMNS)
    .from(honeytokens)
    .orderBy(asc(honeytokens.label), asc(honeytokens.id))
    .all()
    .map((row) => ({
      ...row,
      lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    }));
}

/** Records and dispatches a marked test without touching last-triggered time or trigger count. */
export function testHoneytoken(
  db: AppDb,
  id: string,
  context: { requestId: string; administratorId: string },
) {
  const token = db.select(SAFE_COLUMNS).from(honeytokens).where(eq(honeytokens.id, id)).get();
  if (!token?.enabled) throw new NotFoundError();

  registerAlertDispatcher(new CanarytokensDispatcher(db));
  registerAlertDispatcher(new WebhookAlertDispatcher(db));
  const eventId = recordSecurityEvent(db, {
    type: 'HONEYTOKEN_TESTED',
    requestId: context.requestId,
    userId: context.administratorId,
    honeytokenId: token.id,
    details: { test: true, trapKind: token.kind },
  });
  if (!eventId) throw new Error('Could not record honeytoken test event.');
  return { eventId, test: true as const };
}
