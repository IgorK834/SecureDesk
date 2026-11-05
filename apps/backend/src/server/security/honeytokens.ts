import { randomInt } from 'node:crypto';
import { and, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type HoneytokenKind, honeytokens, securityEvents } from '../db/schema';
import { clock } from '../time/clock';
import {
  type AlertDispatcher,
  type AlertResult,
  type SecurityEventRecord,
  registerAlertDispatcher,
} from './alerts';
import { recordAggregated, recordSecurityEvent } from './events';
import { WebhookAlertDispatcher } from './webhook-alerts';

export const CANARY_REQUEST_TIMEOUT_MS = 3_000;
export const CANARY_DEDUPLICATION_MS = 5 * 60 * 1_000;
const CANARY_RETRY_JITTER_MIN_MS = 25;
const CANARY_RETRY_JITTER_MAX_MS = 125;

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sends only a locally generated event id and the configured token label. */
export class CanarytokensDispatcher implements AlertDispatcher {
  readonly id = 'canarytokens';
  readonly timeoutMs = CANARY_REQUEST_TIMEOUT_MS * 2 + CANARY_RETRY_JITTER_MAX_MS + 250;

  constructor(
    private readonly db: AppDb,
    private readonly env: Env = process.env,
    private readonly fetchImpl: Fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = delay,
    private readonly jitter: () => number = () =>
      randomInt(CANARY_RETRY_JITTER_MIN_MS, CANARY_RETRY_JITTER_MAX_MS + 1),
  ) {}

  async send(event: SecurityEventRecord): Promise<AlertResult> {
    if (
      !event.honeytokenId ||
      !['HONEYTOKEN_TRIGGERED', 'HONEYTOKEN_TESTED', 'DECOY_RESOURCE_ACCESSED'].includes(event.type)
    ) {
      return { outcome: 'SUPPRESSED' };
    }

    const token = this.db
      .select()
      .from(honeytokens)
      .where(eq(honeytokens.id, event.honeytokenId))
      .get();
    if (!token?.enabled) return { outcome: 'SUPPRESSED' };

    const duplicate = this.db
      .select({ id: securityEvents.id })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.type, event.type),
          eq(securityEvents.honeytokenId, token.id),
          event.ipKey === null
            ? isNull(securityEvents.ipKey)
            : eq(securityEvents.ipKey, event.ipKey),
          gte(
            securityEvents.occurredAt,
            new Date(event.occurredAt.getTime() - CANARY_DEDUPLICATION_MS),
          ),
          ne(securityEvents.id, event.id),
        ),
      )
      .get();
    if (duplicate) return { outcome: 'SUPPRESSED' };
    if (this.env.CANARY_ALERTS_ENABLED === 'false') return { outcome: 'SUPPRESSED' };

    const variable = token.alertUrlEnv;
    if (!variable) return { outcome: 'SUPPRESSED' };
    const rawUrl = variable ? this.env[variable]?.trim() : undefined;
    if (!rawUrl) throw new Error('Canary alert URL is not configured.');
    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' &&
      !(this.env.NODE_ENV !== 'production' && url.protocol === 'http:')
    ) {
      throw new Error('Canary alert URL must use HTTPS.');
    }

    const marker = event.type === 'HONEYTOKEN_TESTED' ? 'TEST' : 'event';
    const userAgent = `SecureDesk-Honeytoken/${encodeURIComponent(token.label)} ${marker}/${event.id}`;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'GET',
          headers: { 'user-agent': userAgent },
          redirect: 'error',
          signal: AbortSignal.timeout(CANARY_REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return { outcome: 'SENT' };
      } catch {
        // A failed call is retried once below; provider details and the secret URL are never logged.
      }
      if (attempt === 0) await this.wait(this.jitter());
    }
    throw new Error('Canary alert delivery failed.');
  }
}

export interface HoneytokenContext {
  db: AppDb;
  ipKey: string;
  requestId: string;
  userAgent?: string | null;
  now?: Date;
}

/** Updates the trap, records its event, and starts alert delivery without awaiting the network. */
export function triggerHoneytoken(input: {
  tokenId: string;
  source: HoneytokenKind;
  ctx: HoneytokenContext;
}): string | undefined {
  const now = input.ctx.now ?? clock.now();
  const updated = input.ctx.db
    .update(honeytokens)
    .set({
      lastTriggeredAt: now,
      triggerCount: sql`${honeytokens.triggerCount} + 1`,
    })
    .where(
      and(
        eq(honeytokens.id, input.tokenId),
        eq(honeytokens.kind, input.source),
        eq(honeytokens.enabled, true),
      ),
    )
    .run();
  if (updated.changes === 0) return undefined;

  registerAlertDispatcher(new CanarytokensDispatcher(input.ctx.db));
  registerAlertDispatcher(new WebhookAlertDispatcher(input.ctx.db));
  if (input.source === 'AWS_KEYS') {
    return recordAggregated(input.ctx.db, {
      type: 'DECOY_RESOURCE_ACCESSED',
      requestId: input.ctx.requestId,
      ipKey: input.ctx.ipKey,
      userAgent: input.ctx.userAgent,
      honeytokenId: input.tokenId,
      details: { resource: '/api/backup/config' },
    });
  }
  return recordSecurityEvent(input.ctx.db, {
    type: 'HONEYTOKEN_TRIGGERED',
    requestId: input.ctx.requestId,
    ipKey: input.ctx.ipKey,
    userAgent: input.ctx.userAgent,
    honeytokenId: input.tokenId,
    details: { trapKind: input.source },
  });
}
