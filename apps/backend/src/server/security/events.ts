import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/connection';
import { type SecurityEventSeverity, securityEvents } from '../db/schema';
import { purgeIfDue } from '../maintenance/purge';
import { clock } from '../time/clock';
import { type SecurityEventRecord, dispatchAlerts, listAlertDispatchers } from './alerts';

/** An aggregated event counts the occurrences in one bucket instead of adding a row for each. */
export const AGGREGATION_BUCKET_MS = 5 * 60 * 1000;

/** What is kept of a user agent. Longer is a fingerprint the audit trail has no use for. */
export const MAX_USER_AGENT_LENGTH = 200;

const count = z.number().int().min(1);
const shortText = z.string().min(1).max(100);

/**
 * The security event types: each has a fixed severity and a strict schema for `details`, so the
 * audit trail has a known shape and nothing but the listed, harmless fields can enter it.
 *
 *  - `aggregated`: noisy types, recorded with `recordAggregated` (one row per type, address and
 *    5-minute bucket, `details.count` says how many), so a bot cannot flood the table;
 *  - `alert`: the event is also sent to the registered alert dispatchers.
 *
 * Field names must not look like secrets (`/password|token|secret|answer|captcha/i`), which
 * `recordSecurityEvent` enforces: a token is referred to by `honeytokenId`, a trap by `trapKind`.
 */
export const SECURITY_EVENTS = {
  ACCOUNT_LOCKED: {
    severity: 'WARNING',
    details: z.strictObject({ attempts: count, lockedUntil: z.iso.datetime() }),
  },
  LOGIN_IP_BLOCKED: {
    severity: 'WARNING',
    aggregated: true,
    details: z.strictObject({ count, limit: count }),
  },
  CAPTCHA_FAILED: {
    severity: 'INFO',
    aggregated: true,
    details: z.strictObject({ count, form: z.enum(['login', 'change-password']) }),
  },
  CAPTCHA_PROVIDER_ERROR: {
    severity: 'WARNING',
    details: z.strictObject({
      provider: z.enum(['internal', 'turnstile', 'recaptcha']),
      cause: z.enum(['TIMEOUT', 'HTTP_ERROR', 'BAD_RESPONSE']),
    }),
  },
  HONEYPOT_TRIGGERED: {
    severity: 'WARNING',
    aggregated: true,
    details: z.strictObject({ count }),
  },
  HONEYTOKEN_TRIGGERED: {
    severity: 'CRITICAL',
    alert: true,
    details: z.strictObject({ trapKind: z.enum(['ACCOUNT_TRAP', 'AWS_KEYS']) }),
  },
  HONEYTOKEN_TESTED: {
    severity: 'INFO',
    alert: true,
    details: z.strictObject({
      test: z.literal(true),
      trapKind: z.enum(['ACCOUNT_TRAP', 'AWS_KEYS']),
    }),
  },
  DECOY_RESOURCE_ACCESSED: {
    severity: 'CRITICAL',
    aggregated: true,
    alert: true,
    details: z.strictObject({ count, resource: shortText }),
  },
  PASSWORD_SPRAYING_SUSPECTED: {
    severity: 'WARNING',
    details: z.strictObject({ distinctLogins: count, threshold: count }),
  },
  CHANGE_PASSWORD_BRUTE_FORCE: {
    severity: 'WARNING',
    details: z.strictObject({ failures: count }),
  },
  ACCOUNT_UNLOCKED_BY_ADMIN: {
    severity: 'INFO',
    details: z.strictObject({ adminId: shortText }),
  },
  IP_BLOCK_CLEARED_BY_ADMIN: {
    severity: 'INFO',
    details: z.strictObject({ adminId: shortText, clearedIpKey: shortText }),
  },
  SECURITY_SETTINGS_CHANGED: {
    severity: 'INFO',
    details: z.strictObject({
      adminId: shortText,
      changedKeys: z
        .array(
          z.enum([
            'minPasswordLength',
            'rejectPersonalDataInPassword',
            'passwordMaxAgeDays',
            'sessionIdleTimeoutMinutes',
            'maxFailedLoginAttempts',
            'ipFailedAttemptLimit',
            'sprayingDistinctLoginThreshold',
            'securityEventRetentionDays',
          ]),
        )
        .min(1),
    }),
  },
} as const satisfies Record<
  string,
  {
    severity: SecurityEventSeverity;
    details: z.ZodType;
    aggregated?: true;
    alert?: true;
  }
>;

export type SecurityEventType = keyof typeof SECURITY_EVENTS;
type DetailsOf<T extends SecurityEventType> = z.input<(typeof SECURITY_EVENTS)[T]['details']>;
export type AggregatedEventType = {
  [K in SecurityEventType]: (typeof SECURITY_EVENTS)[K] extends { aggregated: true } ? K : never;
}[SecurityEventType];

/** Where an event came from. Everything is optional except the request id. */
export interface SecurityEventContext {
  requestId: string;
  ipKey?: string | null;
  /** Cut to `MAX_USER_AGENT_LENGTH` characters. */
  userAgent?: string | null;
  loginNormalized?: string | null;
  userId?: string | null;
  honeytokenId?: string | null;
}

export type SecurityEventInput<T extends SecurityEventType = SecurityEventType> = {
  [K in T]: SecurityEventContext & { type: K; details: DetailsOf<K> };
}[T];

export type AggregatedEventInput<T extends AggregatedEventType = AggregatedEventType> = {
  [K in T]: SecurityEventContext & { type: K; details: Omit<DetailsOf<K>, 'count'> };
}[T];

const SECRET_KEY = /password|token|secret|answer|captcha/i;

/** The first key, at any depth, whose name looks like it could hold a credential. */
function secretKeyIn(value: unknown, depth = 0): string | undefined {
  if (depth > 5 || typeof value !== 'object' || value === null) return undefined;
  for (const [key, inner] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) return key;
    const nested = secretKeyIn(inner, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Whatever is wrong with the event, a request must not fail because of it in production, while
 * development and tests must not be able to miss it. The message names the type and the key, never
 * a value.
 */
function reject(reason: string): undefined {
  if (process.env.NODE_ENV === 'production') return undefined;
  throw new Error(`security event refused: ${reason}`);
}

/** Checks the event against the registry; the parsed details, or undefined when it was refused. */
function validated(type: string, details: unknown): Record<string, unknown> | undefined {
  const definition = (
    SECURITY_EVENTS as Record<string, (typeof SECURITY_EVENTS)[SecurityEventType]>
  )[type];
  if (!definition) return reject(`unknown event type "${type}"`);

  const secret = secretKeyIn(details);
  if (secret) return reject(`${type} has a details key that looks like a secret ("${secret}")`);

  const parsed = definition.details.safeParse(details);
  if (!parsed.success) return reject(`${type} details do not match the declared schema`);
  return parsed.data as Record<string, unknown>;
}

const pendingAlerts = new Set<Promise<void>>();

/**
 * Sends the event to the alert dispatchers without making anyone wait for them and writes how it
 * went back to the row. The event is already stored, so nothing here can lose it, and nothing here
 * can throw into the caller.
 */
function dispatchInBackground(db: AppDb, record: SecurityEventRecord): void {
  const run = dispatchAlerts(record)
    .then((status) => {
      db.update(securityEvents)
        .set({ alertStatus: status, alertAttemptedAt: clock.now() })
        .where(eq(securityEvents.id, record.id))
        .run();
    })
    .catch(() => undefined)
    .finally(() => pendingAlerts.delete(run));
  pendingAlerts.add(run);
}

/** Resolves when every alert started so far has finished. For tests and a graceful shutdown. */
export async function flushPendingAlerts(): Promise<void> {
  await Promise.all([...pendingAlerts]);
}

function newRow(
  input: SecurityEventContext & { type: SecurityEventType },
  details: Record<string, unknown>,
) {
  const definition = SECURITY_EVENTS[input.type];
  const dispatchable = 'alert' in definition && listAlertDispatchers().length > 0;
  return {
    id: randomUUID(),
    type: input.type,
    severity: definition.severity,
    occurredAt: clock.now(),
    ipKey: input.ipKey ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
    loginNormalized: input.loginNormalized ?? null,
    userId: input.userId ?? null,
    honeytokenId: input.honeytokenId ?? null,
    details: JSON.stringify(details),
    requestId: input.requestId,
    alertStatus: dispatchable ? ('PENDING' as const) : ('NONE' as const),
  };
}

function afterInsert(db: AppDb, row: ReturnType<typeof newRow>, details: Record<string, unknown>) {
  if (row.alertStatus === 'PENDING') {
    dispatchInBackground(db, {
      id: row.id,
      type: row.type,
      severity: row.severity,
      occurredAt: row.occurredAt,
      ipKey: row.ipKey,
      loginNormalized: row.loginNormalized,
      userId: row.userId,
      honeytokenId: row.honeytokenId,
      details,
      requestId: row.requestId,
    });
  }
  purgeIfDue(db);
}

/**
 * Stores one security event, synchronously, and returns its id.
 *
 * The type must be in `SECURITY_EVENTS`, `details` must match its schema, and no key may look like
 * a secret. A refused event throws outside production and is dropped (`undefined`) in production.
 * An event whose type asks for an alert is handed to the alert dispatchers afterwards, in the
 * background: see `dispatchAlerts`.
 */
export function recordSecurityEvent(db: AppDb, input: SecurityEventInput): string | undefined {
  const details = validated(input.type, input.details);
  if (!details) return undefined;

  const row = newRow(input, details);
  db.insert(securityEvents).values(row).run();
  afterInsert(db, row, details);
  return row.id;
}

/**
 * Stores at most one event of this type for one address in the current aggregation bucket.
 * Unlike `recordAggregated`, repeated observations do not increase a counter. This is used for
 * threshold signals such as password spraying, where one event per bucket is sufficient.
 */
export function recordSecurityEventOncePerBucket(
  db: AppDb,
  input: SecurityEventInput,
): string | undefined {
  const details = validated(input.type, input.details);
  if (!details) return undefined;

  const ipKey = input.ipKey ?? null;
  const now = clock.now().getTime();
  const bucketStart = new Date(now - (now % AGGREGATION_BUCKET_MS));
  const bucketEnd = new Date(bucketStart.getTime() + AGGREGATION_BUCKET_MS);
  const inserted = db.transaction(
    (tx) => {
      const existing = tx
        .select({ id: securityEvents.id })
        .from(securityEvents)
        .where(
          and(
            eq(securityEvents.type, input.type),
            ipKey === null ? isNull(securityEvents.ipKey) : eq(securityEvents.ipKey, ipKey),
            gte(securityEvents.occurredAt, bucketStart),
            lt(securityEvents.occurredAt, bucketEnd),
          ),
        )
        .get();
      if (existing) return undefined;

      const row = newRow(input, details);
      tx.insert(securityEvents).values(row).run();
      return row;
    },
    { behavior: 'immediate' },
  );

  if (!inserted) return undefined;
  afterInsert(db, inserted, details);
  return inserted.id;
}

/**
 * Records an occurrence of a noisy event type. The first one in a 5-minute bucket for one address
 * creates the row (`details.count = 1`); the following ones only raise the counter, so a thousand
 * identical events are one row with `details.count = 1000`. The other details are those of the
 * first occurrence. Returns the id of the row, or `undefined` when the event was refused.
 */
export function recordAggregated(db: AppDb, input: AggregatedEventInput): string | undefined {
  const definition = SECURITY_EVENTS[input.type] as { aggregated?: true };
  if (!definition.aggregated) {
    return reject(`${input.type} is not an aggregated event type`);
  }
  const details = validated(input.type, { ...input.details, count: 1 });
  if (!details) return undefined;

  const ipKey = input.ipKey ?? null;
  const now = clock.now().getTime();
  const bucketStart = new Date(now - (now % AGGREGATION_BUCKET_MS));
  const bucketEnd = new Date(bucketStart.getTime() + AGGREGATION_BUCKET_MS);

  const result = db.transaction(
    (tx) => {
      const existing = tx
        .select({ id: securityEvents.id, details: securityEvents.details })
        .from(securityEvents)
        .where(
          and(
            eq(securityEvents.type, input.type),
            ipKey === null ? isNull(securityEvents.ipKey) : eq(securityEvents.ipKey, ipKey),
            gte(securityEvents.occurredAt, bucketStart),
            lt(securityEvents.occurredAt, bucketEnd),
          ),
        )
        .get();

      if (existing) {
        const stored = JSON.parse(existing.details) as { count: number };
        tx.update(securityEvents)
          .set({ details: JSON.stringify({ ...stored, count: stored.count + 1 }) })
          .where(eq(securityEvents.id, existing.id))
          .run();
        return { id: existing.id };
      }

      const row = newRow(input, details);
      tx.insert(securityEvents).values(row).run();
      return { id: row.id, row };
    },
    { behavior: 'immediate' },
  );

  if (result.row) afterInsert(db, result.row, details);
  else purgeIfDue(db);
  return result.id;
}
