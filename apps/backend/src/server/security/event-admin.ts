import { type SQL, and, count, desc, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from '../db/connection';
import {
  ALERT_STATUSES,
  SECURITY_EVENT_SEVERITIES,
  type SecurityEventRow,
  securityEvents,
} from '../db/schema';
import { NotFoundError } from '../http/errors';
import { clock } from '../time/clock';
import { SECURITY_EVENTS, type SecurityEventType } from './events';

const EVENT_TYPES = Object.keys(SECURITY_EVENTS) as [SecurityEventType, ...SecurityEventType[]];

export const SecurityEventsQuery = z
  .strictObject({
    type: z.enum(EVENT_TYPES).optional(),
    severity: z.enum(SECURITY_EVENT_SEVERITIES).optional(),
    acknowledged: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    from: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    to: z.iso
      .datetime()
      .transform((value) => new Date(value))
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to);

export const SecurityEventParams = z.strictObject({ id: z.string().uuid() });

export type SecurityEventsQueryInput = z.output<typeof SecurityEventsQuery>;

export interface SecurityEventDto {
  id: string;
  type: string;
  severity: (typeof SECURITY_EVENT_SEVERITIES)[number];
  occurredAt: string;
  ipKey: string | null;
  subjectUserId: string | null;
  details: Record<string, unknown>;
  requestId: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  alertStatus: (typeof ALERT_STATUSES)[number];
  alertAttemptedAt: string | null;
}

const EVENT_COLUMNS = {
  id: securityEvents.id,
  type: securityEvents.type,
  severity: securityEvents.severity,
  occurredAt: securityEvents.occurredAt,
  ipKey: securityEvents.ipKey,
  userId: securityEvents.userId,
  details: securityEvents.details,
  requestId: securityEvents.requestId,
  acknowledgedAt: securityEvents.acknowledgedAt,
  acknowledgedBy: securityEvents.acknowledgedBy,
  alertStatus: securityEvents.alertStatus,
  alertAttemptedAt: securityEvents.alertAttemptedAt,
} as const;

type SafeEventRow = Pick<SecurityEventRow, keyof typeof EVENT_COLUMNS>;

function safeDetails(row: Pick<SafeEventRow, 'type' | 'details'>): Record<string, unknown> {
  try {
    const raw = JSON.parse(row.details) as unknown;
    const definition = (
      SECURITY_EVENTS as Record<string, (typeof SECURITY_EVENTS)[SecurityEventType]>
    )[row.type];
    const parsed = definition?.details.safeParse(raw);
    return parsed?.success ? (parsed.data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Explicit public shape: attacker-controlled login and user-agent fields are never selected. */
export function toSecurityEventDto(row: SafeEventRow): SecurityEventDto {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    occurredAt: row.occurredAt.toISOString(),
    ipKey: row.ipKey,
    subjectUserId: row.userId,
    details: safeDetails(row),
    requestId: row.requestId,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedBy: row.acknowledgedBy,
    alertStatus: row.alertStatus,
    alertAttemptedAt: row.alertAttemptedAt?.toISOString() ?? null,
  };
}

export function listSecurityEvents(db: AppDb, query: SecurityEventsQueryInput) {
  const filters: (SQL | undefined)[] = [
    query.type ? eq(securityEvents.type, query.type) : undefined,
    query.severity ? eq(securityEvents.severity, query.severity) : undefined,
    query.acknowledged === true
      ? isNotNull(securityEvents.acknowledgedAt)
      : query.acknowledged === false
        ? isNull(securityEvents.acknowledgedAt)
        : undefined,
    query.from ? gte(securityEvents.occurredAt, query.from) : undefined,
    query.to ? lte(securityEvents.occurredAt, query.to) : undefined,
  ];
  const where = and(...filters);
  const [{ total = 0 } = {}] = db
    .select({ total: count() })
    .from(securityEvents)
    .where(where)
    .all();
  const items = db
    .select(EVENT_COLUMNS)
    .from(securityEvents)
    .where(where)
    .orderBy(desc(securityEvents.occurredAt), desc(securityEvents.id))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all()
    .map(toSecurityEventDto);
  return { items, total, page: query.page, pageSize: query.pageSize };
}

/** First acknowledgement wins; later calls return the same row without changing it. */
export function acknowledgeSecurityEvent(db: AppDb, id: string, administratorId: string) {
  return db.transaction(
    (tx) => {
      const existing = tx
        .select(EVENT_COLUMNS)
        .from(securityEvents)
        .where(eq(securityEvents.id, id))
        .get();
      if (!existing) throw new NotFoundError();
      if (!existing.acknowledgedAt) {
        tx.update(securityEvents)
          .set({ acknowledgedAt: clock.now(), acknowledgedBy: administratorId })
          .where(and(eq(securityEvents.id, id), isNull(securityEvents.acknowledgedAt)))
          .run();
      }
      const stored = tx
        .select(EVENT_COLUMNS)
        .from(securityEvents)
        .where(eq(securityEvents.id, id))
        .get();
      if (!stored) throw new NotFoundError();
      return toSecurityEventDto(stored);
    },
    { behavior: 'immediate' },
  );
}
