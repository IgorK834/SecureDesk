import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDb, type AppDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { auditLog, lokiShipCursor } from '../db/schema';
import { appendAuditEntry } from './append';
import { GENESIS_HASH } from './chain';
import { lokiPushEndpoint, queueLokiShipping, shipAuditToLoki } from './ship-loki';

const base = 'http://127.0.0.1:38290';
const time = { now: () => new Date('2030-01-01T00:00:00.123Z') };
let folder: string;
let filename: string;
let db: AppDb;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'securedesk-loki-'));
  filename = join(folder, 'ship.sqlite');
  vi.stubEnv('LOKI_PUSH_URL', base);
  db = createDb(filename);
  runMigrations(db);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (db.$client.open) db.$client.close();
  rmSync(folder, { recursive: true, force: true });
});

function append(n: number) {
  db.transaction((tx) => {
    for (let i = 0; i < n; i++)
      appendAuditEntry(
        tx,
        {
          actorType: 'SYSTEM',
          requestId: 'loki-fixture',
          action: 'AUTH_LOGIN_FAILURE',
          outcome: 'FAILURE',
          details: { reason: 'BAD_CREDENTIALS' },
        },
        time,
      );
  });
}
function ack(status = 204) {
  return new Response(null, { status });
}
type Entry = {
  seq: number;
  prev_hash: string;
  entry_hash: string;
  occurred_at: string;
  action: string;
};
function collector() {
  const received: Entry[] = [];
  const batchSizes: number[] = [];
  const request = vi.fn<typeof fetch>(async (url, options) => {
    expect(url.toString()).toBe(base + '/loki/api/v1/push');
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    const [stream] = JSON.parse(options!.body as string).streams;
    expect(stream.stream).toEqual({ app: 'securedesk', stream: 'audit' });
    batchSizes.push(stream.values.length);
    for (const [timestamp, line] of stream.values) {
      expect(timestamp).toBe('1893456000123000000');
      received.push(JSON.parse(line));
    }
    return ack();
  });
  return { received, batchSizes, request };
}

it('SEC-95 ships ordered batches with both hashes and never resends an acknowledged prefix after reopening', async () => {
  append(205);
  const remote = collector();
  expect(await shipAuditToLoki(db, remote.request)).toEqual({ status: 'complete', shipped: 205 });
  expect(remote.batchSizes).toEqual([100, 100, 5]);
  expect(remote.received.map((row) => row.seq)).toEqual(
    Array.from({ length: 205 }, (_, i) => i + 1),
  );
  const local = db.select().from(auditLog).orderBy(auditLog.seq).all();
  expect(remote.received.map((row) => [row.prev_hash, row.entry_hash])).toEqual(
    local.map((row) => [row.prevHash, row.entryHash]),
  );
  expect(remote.received[0]?.prev_hash).toBe(GENESIS_HASH);
  db.$client.close();
  db = createDb(filename);
  expect(await shipAuditToLoki(db, remote.request)).toMatchObject({ shipped: 0 });
  expect(remote.request).toHaveBeenCalledTimes(3);
  append(1);
  expect(await shipAuditToLoki(db, remote.request)).toMatchObject({ shipped: 1 });
  expect(remote.received.at(-1)?.seq).toBe(206);
});

it('SEC-95 resumes at the last acknowledged sequence after a failed later batch', async () => {
  append(105);
  const remote = collector();
  let call = 0;
  const timeout = vi.fn<typeof fetch>(async (...args) => {
    if (++call === 2) return ack(503);
    return remote.request(...args);
  });
  await expect(shipAuditToLoki(db, timeout)).rejects.toThrow(/did not acknowledge/);
  expect(db.select().from(lokiShipCursor).get()).toMatchObject({ lastSeq: 100, leaseOwner: null });
  expect(await shipAuditToLoki(db, remote.request)).toMatchObject({ shipped: 5 });
  expect(remote.received.map((row) => row.seq)).toEqual(
    Array.from({ length: 105 }, (_, i) => i + 1),
  );
});

it('SEC-95 queues work after commit, backs off and catches up while requests keep committing', async () => {
  vi.useFakeTimers();
  const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  db.$client.close();
  db = createDb(filename, queueLokiShipping);
  const remote = collector();
  const stub = vi.fn<typeof fetch>(async (...args) => remote.request(...args));
  stub.mockResolvedValueOnce(ack(503)).mockRejectedValueOnce(new Error('fixture outage'));
  vi.stubGlobal('fetch', stub);
  append(1);
  expect(stub).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(250);
  expect(stub).toHaveBeenCalledTimes(1);
  expect(db.select().from(lokiShipCursor).get()?.lastSeq).toBe(0);
  append(2);
  expect(db.select().from(auditLog).all()).toHaveLength(3);
  await vi.advanceTimersByTimeAsync(999);
  expect(stub).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(stub).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2000);
  expect(remote.received.map((row) => row.seq)).toEqual([1, 2, 3]);
  expect(log).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('uses a lease across connections and ships only the captured head while new writes continue', async () => {
  append(1);
  const remote = collector();
  const pending = Promise.withResolvers<Response>();
  const slow = vi.fn<typeof fetch>(async (...args) => {
    await remote.request(...args);
    return pending.promise;
  });
  const running = shipAuditToLoki(db, slow);
  const sibling = createDb(filename);
  try {
    expect(await shipAuditToLoki(sibling, remote.request)).toEqual({ status: 'busy', shipped: 0 });
    append(1);
    pending.resolve(ack());
    expect(await running).toMatchObject({ shipped: 1 });
    expect(await shipAuditToLoki(sibling, remote.request)).toMatchObject({ shipped: 1 });
    expect(remote.received.map((row) => row.seq)).toEqual([1, 2]);
  } finally {
    sibling.$client.close();
  }
});

it('stays idle when unset and validates the loopback or HTTPS destination without leaking credentials', async () => {
  vi.stubEnv('LOKI_PUSH_URL', '');
  append(1);
  const mock = vi.fn<typeof fetch>();
  queueLokiShipping(db);
  expect(await shipAuditToLoki(db, mock)).toEqual({ status: 'disabled', shipped: 0 });
  expect(mock).not.toHaveBeenCalled();
  expect(db.select().from(lokiShipCursor).get()).toBeUndefined();
  expect(lokiPushEndpoint('https://logs.example.invalid/base/')?.pathname).toBe(
    '/base/loki/api/v1/push',
  );
  expect(lokiPushEndpoint('http://[::1]:3100')?.hostname).toBe('[::1]');
  for (const value of [
    'not-a-url',
    'http://logs.example.invalid',
    'https://admin:fixture@logs.example.invalid',
    'https://logs.example.invalid/?key=fixture',
  ]) {
    expect(() => lokiPushEndpoint(value)).toThrow(/base HTTPS URL/);
  }
});

it('does not advance for paused ingestion, a changed destination, or a conflicting acknowledged hash', async () => {
  append(1);
  const remote = collector();
  await expect(shipAuditToLoki(db, async () => ack(260))).rejects.toThrow(/did not acknowledge/);
  await shipAuditToLoki(db, remote.request);
  vi.stubEnv('LOKI_PUSH_URL', 'https://other.example.invalid');
  await expect(shipAuditToLoki(db, remote.request)).rejects.toThrow(
    /differs from the stored cursor/,
  );
  vi.stubEnv('LOKI_PUSH_URL', base);
  db.update(lokiShipCursor)
    .set({ lastHash: 'a'.repeat(64) })
    .where(eq(lokiShipCursor.id, 1))
    .run();
  await expect(shipAuditToLoki(db, remote.request)).rejects.toThrow(/acknowledged Loki prefix/);
  expect(remote.received).toHaveLength(1);
});
