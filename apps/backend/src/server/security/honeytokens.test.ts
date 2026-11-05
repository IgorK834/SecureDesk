import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { honeytokens, securityEvents } from '../db/schema';
import { ACCOUNT_TRAP_ALERT_ENV, ACCOUNT_TRAP_ID, seedHoneytokens } from '../db/seeds/honeytokens';
import { clearAlertDispatchers } from './alerts';
import { flushPendingAlerts } from './events';
import { CanarytokensDispatcher, triggerHoneytoken } from './honeytokens';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);
let db: AppDb;

beforeEach(() => {
  db = createMigratedDb();
  db.transaction((tx) => seedHoneytokens(tx));
  fakeClock.set(T0);
  fakeClock.install();
  clearAlertDispatchers();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CANARY_ALERTS_ENABLED', 'true');
  vi.stubEnv(ACCOUNT_TRAP_ALERT_ENV, 'http://canary-stub.test/web-bug');
});

afterEach(async () => {
  await flushPendingAlerts();
  clearAlertDispatchers();
  fakeClock.uninstall();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  db.$client.close();
});

const fire = (ipKey = '203.0.113.9') =>
  triggerHoneytoken({
    tokenId: ACCOUNT_TRAP_ID,
    source: 'ACCOUNT_TRAP',
    ctx: {
      db,
      ipKey,
      requestId: 'event-request-id',
      userAgent: 'attacker-browser private-header',
      now: fakeClock.now(),
    },
  });

describe('triggerHoneytoken and CanarytokensDispatcher', () => {
  it('SEC-51 stores every trigger but calls the configured URL once per token and address bucket', async () => {
    const fetchStub = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);

    const firstId = fire();
    const secondId = fire();
    await flushPendingAlerts();

    expect(firstId).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://canary-stub.test/web-bug');
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' });
    const outgoing = JSON.stringify({ url: url.toString(), headers: init.headers });
    expect(outgoing).toContain(firstId as string);
    expect(outgoing).toContain('Backup%20administrator%20account');
    expect(outgoing).not.toMatch(
      /backup_admin|hunter2|203\.0\.113\.9|attacker-browser|private-header/,
    );

    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .map((event) => event.alertStatus)
        .sort(),
    ).toStrictEqual(['SENT', 'SUPPRESSED']);
    expect(
      db.select().from(honeytokens).where(eq(honeytokens.id, ACCOUNT_TRAP_ID)).get(),
    ).toMatchObject({ triggerCount: 2, lastTriggeredAt: T0 });
  });

  it('SEC-54 retries one failing call in the background and marks the event FAILED', async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchStub);

    const eventId = fire();
    expect(eventId).toBeTruthy();
    expect(fetchStub).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(125);
    await flushPendingAlerts();

    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(
      db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.id, eventId as string))
        .get(),
    ).toMatchObject({ alertStatus: 'FAILED' });
  });

  it('suppresses external delivery when alerts are disabled while retaining the event', async () => {
    vi.stubEnv('CANARY_ALERTS_ENABLED', 'false');
    const fetchStub = vi.fn();
    vi.stubGlobal('fetch', fetchStub);

    const eventId = fire('198.51.100.4');
    await flushPendingAlerts();

    expect(fetchStub).not.toHaveBeenCalled();
    expect(
      db
        .select()
        .from(securityEvents)
        .where(eq(securityEvents.id, eventId as string))
        .get(),
    ).toMatchObject({ alertStatus: 'SUPPRESSED' });
  });

  it('ignores a missing, disabled or wrong-kind token without creating an event', () => {
    expect(
      triggerHoneytoken({
        tokenId: 'missing',
        source: 'ACCOUNT_TRAP',
        ctx: { db, ipKey: 'unknown', requestId: 'missing' },
      }),
    ).toBeUndefined();
    expect(
      triggerHoneytoken({
        tokenId: ACCOUNT_TRAP_ID,
        source: 'AWS_KEYS',
        ctx: { db, ipKey: 'unknown', requestId: 'wrong-kind' },
      }),
    ).toBeUndefined();
    db.update(honeytokens).set({ enabled: false }).where(eq(honeytokens.id, ACCOUNT_TRAP_ID)).run();
    expect(fire()).toBeUndefined();
    expect(db.select().from(securityEvents).all()).toEqual([]);
  });

  it('suppresses unrelated events and refuses a non-HTTPS production endpoint', async () => {
    const dispatcher = new CanarytokensDispatcher(db, {
      NODE_ENV: 'production',
      CANARY_ALERTS_ENABLED: 'true',
      [ACCOUNT_TRAP_ALERT_ENV]: 'http://canary-stub.test/web-bug',
    });
    const base = {
      id: 'event-id',
      severity: 'CRITICAL' as const,
      occurredAt: T0,
      ipKey: '203.0.113.9',
      loginNormalized: null,
      userId: null,
      honeytokenId: ACCOUNT_TRAP_ID,
      details: {},
      requestId: 'request-id',
    };

    await expect(dispatcher.send({ ...base, type: 'ACCOUNT_LOCKED' })).resolves.toEqual({
      outcome: 'SUPPRESSED',
    });
    await expect(dispatcher.send({ ...base, type: 'HONEYTOKEN_TRIGGERED' })).rejects.toThrow(
      /HTTPS/,
    );
  });
});
