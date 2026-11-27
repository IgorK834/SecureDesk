import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, lte } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { auditLog, lokiShipCursor } from '../db/schema';
import { logEvent } from '../security/log-event';
import { canonicalize, computeEntryHash, GENESIS_HASH } from './chain';
import { toExportRow } from './export';

const batchSize = 100;
const timeoutMs = 3_000;
const leaseMs = 15_000;
const coalesceMs = 250;
const initialBackoff = 1_000;
const maxBackoff = 60_000;
const singleton = eq(lokiShipCursor.id, 1);

export function lokiPushEndpoint(value = process.env.LOKI_PUSH_URL): URL | null {
  if (!value?.trim()) return null;
  const url = URL.parse(value.trim());
  const loopback = url && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    !url ||
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'LOKI_PUSH_URL must be a base HTTPS URL or a local loopback HTTP URL without credentials.',
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/loki/api/v1/push';
  return url;
}

function claim(db: AppDb, endpoint: URL, owner: string) {
  const destination = createHash('sha256').update(endpoint.href).digest('hex');
  return db.transaction(
    (tx) => {
      tx.insert(lokiShipCursor)
        .values({ id: 1, destination, lastSeq: 0, lastHash: GENESIS_HASH })
        .onConflictDoNothing()
        .run();
      const cursor = tx.select().from(lokiShipCursor).where(singleton).get()!;
      if (cursor.destination !== destination)
        throw new Error('The Loki destination differs from the stored cursor.');
      if (cursor.leaseUntil > Date.now()) return null;
      if (cursor.lastSeq > 0) {
        const local = tx
          .select({ hash: auditLog.entryHash })
          .from(auditLog)
          .where(eq(auditLog.seq, cursor.lastSeq))
          .get();
        if (local?.hash !== cursor.lastHash)
          throw new Error('The audit log differs from the acknowledged Loki prefix.');
      }
      tx.update(lokiShipCursor)
        .set({ leaseOwner: owner, leaseUntil: Date.now() + leaseMs })
        .where(singleton)
        .run();
      const head = tx
        .select({ seq: auditLog.seq })
        .from(auditLog)
        .orderBy(desc(auditLog.seq))
        .limit(1)
        .get();
      return { lastSeq: cursor.lastSeq, lastHash: cursor.lastHash, head: head?.seq ?? 0 };
    },
    { behavior: 'immediate' },
  );
}

export async function shipAuditToLoki(
  db: AppDb,
  request = fetch,
): Promise<{
  status: 'disabled' | 'busy' | 'complete';
  shipped: number;
}> {
  const endpoint = lokiPushEndpoint();
  if (!endpoint) return { status: 'disabled', shipped: 0 };
  const owner = randomUUID();
  const cursor = claim(db, endpoint, owner);
  if (!cursor) return { status: 'busy', shipped: 0 };

  let { lastSeq, lastHash } = cursor;
  let shipped = 0;
  const ownsLease = and(singleton, eq(lokiShipCursor.leaseOwner, owner));
  try {
    while (lastSeq < cursor.head) {
      if (
        !db
          .update(lokiShipCursor)
          .set({ leaseUntil: Date.now() + leaseMs })
          .where(ownsLease)
          .run().changes
      ) {
        throw new Error('The Loki shipping lease expired.');
      }
      const rows = db
        .select()
        .from(auditLog)
        .where(and(gt(auditLog.seq, lastSeq), lte(auditLog.seq, cursor.head)))
        .orderBy(asc(auditLog.seq))
        .limit(batchSize)
        .all();
      let previous = lastHash;
      let expectedSeq = lastSeq + 1;
      const values = rows.map((row) => {
        const time = Date.parse(row.occurredAt);
        if (
          !Number.isFinite(time) ||
          row.seq !== expectedSeq++ ||
          row.prevHash !== previous ||
          row.entryHash !== computeEntryHash(previous, canonicalize(row))
        ) {
          throw new Error('The next Loki batch does not extend the local audit chain.');
        }
        previous = row.entryHash;
        return [(BigInt(time) * BigInt(1_000_000)).toString(), JSON.stringify(toExportRow(row))];
      });
      const last = rows.at(-1);
      if (!last) throw new Error('The audit head changed while shipping to Loki.');

      const response = await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streams: [{ stream: { app: 'securedesk', stream: 'audit' }, values }],
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
      // Loki can respond with 260 when ingestion is paused.
      if (!response.ok || response.status === 260)
        throw new Error('Loki did not acknowledge the batch.');

      if (
        !db
          .update(lokiShipCursor)
          .set({ lastSeq: last.seq, lastHash: last.entryHash })
          .where(ownsLease)
          .run().changes
      ) {
        throw new Error('The Loki shipping lease expired after delivery.');
      }
      lastSeq = last.seq;
      lastHash = last.entryHash;
      shipped += rows.length;
    }
    return { status: 'complete', shipped };
  } finally {
    db.update(lokiShipCursor).set({ leaseOwner: null, leaseUntil: 0 }).where(ownsLease).run();
  }
}

interface ShippingState {
  timer: ReturnType<typeof setTimeout> | undefined;
  running: boolean;
  dirty: boolean;
  backoff: number;
}
const shipping = new WeakMap<AppDb, ShippingState>();

function schedule(db: AppDb, state: ShippingState, delay: number): void {
  if (state.timer || state.running) return;
  state.timer = setTimeout(async () => {
    state.timer = undefined;
    state.running = true;
    state.dirty = false;
    try {
      const result = await shipAuditToLoki(db);
      state.backoff = result.status === 'busy' ? initialBackoff : 0;
    } catch {
      state.backoff = Math.min(state.backoff * 2 || initialBackoff, maxBackoff);
      logEvent('audit.loki.shipping_failed', 'system');
    } finally {
      state.running = false;
      if (state.backoff || state.dirty) schedule(db, state, state.backoff || coalesceMs);
    }
  }, delay);
  state.timer.unref();
}

export function queueLokiShipping(db: AppDb): void {
  if (!process.env.LOKI_PUSH_URL?.trim()) return;
  let state = shipping.get(db);
  if (!state) {
    state = { timer: undefined, running: false, dirty: false, backoff: 0 };
    shipping.set(db, state);
  }
  state.dirty = true;
  schedule(db, state, coalesceMs);
}
