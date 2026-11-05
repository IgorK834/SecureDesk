import { randomInt } from 'node:crypto';
import { and, eq, gte, isNull, ne } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { securityEvents } from '../db/schema';
import type { AlertDispatcher, AlertResult, SecurityEventRecord } from './alerts';

const REQUEST_TIMEOUT_MS = 3_000;
const DEDUPLICATION_MS = 5 * 60 * 1_000;
const RETRY_JITTER_MAX_MS = 125;

type Env = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Sends a fixed, request-free JSON envelope to an administrator-controlled webhook. */
export class WebhookAlertDispatcher implements AlertDispatcher {
  readonly id = 'critical-event-webhook';
  readonly timeoutMs = REQUEST_TIMEOUT_MS * 2 + RETRY_JITTER_MAX_MS + 250;

  constructor(
    private readonly db: AppDb,
    private readonly env: Env = process.env,
    private readonly fetchImpl: Fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = delay,
    private readonly jitter: () => number = () => randomInt(25, RETRY_JITTER_MAX_MS + 1),
  ) {}

  async send(event: SecurityEventRecord): Promise<AlertResult> {
    if (event.severity !== 'CRITICAL' && event.type !== 'HONEYTOKEN_TESTED') {
      return { outcome: 'SUPPRESSED' };
    }
    const rawUrl = this.env.ALERT_WEBHOOK_URL?.trim();
    if (!rawUrl) return { outcome: 'SUPPRESSED' };

    const duplicate = this.db
      .select({ id: securityEvents.id })
      .from(securityEvents)
      .where(
        and(
          eq(securityEvents.type, event.type),
          event.ipKey === null
            ? isNull(securityEvents.ipKey)
            : eq(securityEvents.ipKey, event.ipKey),
          gte(securityEvents.occurredAt, new Date(event.occurredAt.getTime() - DEDUPLICATION_MS)),
          ne(securityEvents.id, event.id),
        ),
      )
      .get();
    if (duplicate) return { outcome: 'SUPPRESSED' };

    const url = new URL(rawUrl);
    if (
      url.protocol !== 'https:' &&
      !(this.env.NODE_ENV !== 'production' && url.protocol === 'http:')
    ) {
      throw new Error('Alert webhook URL must use HTTPS.');
    }
    const body = JSON.stringify({
      type: event.type,
      time: event.occurredAt.toISOString(),
      severity: event.severity,
      eventId: event.id,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          redirect: 'error',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (response.ok) return { outcome: 'SENT' };
      } catch {
        // Details are deliberately discarded: a failure may contain the secret webhook URL.
      }
      if (attempt === 0) await this.wait(this.jitter());
    }
    throw new Error('Alert webhook delivery failed.');
  }
}
