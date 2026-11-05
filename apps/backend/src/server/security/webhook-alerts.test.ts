import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { securityEvents } from '../db/schema';
import { clearAlertDispatchers, registerAlertDispatcher } from './alerts';
import { flushPendingAlerts, recordSecurityEvent } from './events';
import { WebhookAlertDispatcher } from './webhook-alerts';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);
let db: AppDb;

beforeEach(() => {
  db = createMigratedDb();
  fakeClock.set(T0);
  fakeClock.install();
  clearAlertDispatchers();
});

afterEach(async () => {
  await flushPendingAlerts();
  clearAlertDispatchers();
  fakeClock.uninstall();
  vi.useRealTimers();
  db.$client.close();
});

const event = () => ({
  type: 'DECOY_RESOURCE_ACCESSED' as const,
  requestId: 'request-id',
  ipKey: '192.0.2.8',
  userAgent: 'attacker password and token header',
  loginNormalized: 'backup_admin',
  details: { count: 1, resource: '/api/backup/config' },
});

describe('WebhookAlertDispatcher', () => {
  it('sends exactly the four allowlisted event fields to the configured endpoint', async () => {
    const fetchStub = vi.fn(async () => new Response(null, { status: 204 }));
    registerAlertDispatcher(
      new WebhookAlertDispatcher(
        db,
        { NODE_ENV: 'test', ALERT_WEBHOOK_URL: 'http://webhook-stub.test/events' },
        fetchStub as unknown as typeof fetch,
      ),
    );

    const eventId = recordSecurityEvent(db, event());
    await flushPendingAlerts();

    expect(fetchStub).toHaveBeenCalledOnce();
    const [url, init] = fetchStub.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://webhook-stub.test/events');
    expect(JSON.parse(init.body as string)).toStrictEqual({
      type: 'DECOY_RESOURCE_ACCESSED',
      time: T0.toISOString(),
      severity: 'CRITICAL',
      eventId,
    });
    expect(init.headers).toEqual({ 'content-type': 'application/json' });
    expect(init.body as string).not.toMatch(/backup_admin|192\.0\.2\.8|password|token|attacker/i);
  });

  it('SEC-54 returns immediately, retries a failing endpoint, and records FAILED', async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn(async () => new Response(null, { status: 500 }));
    registerAlertDispatcher(
      new WebhookAlertDispatcher(
        db,
        { NODE_ENV: 'test', ALERT_WEBHOOK_URL: 'http://webhook-stub.test/events' },
        fetchStub as unknown as typeof fetch,
        async () => undefined,
        () => 25,
      ),
    );

    const eventId = recordSecurityEvent(db, event());
    expect(eventId).toBeTruthy();
    expect(fetchStub).toHaveBeenCalledOnce();
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

  it('is off without a URL and rejects an insecure production URL', async () => {
    const record = {
      id: 'event',
      type: 'DECOY_RESOURCE_ACCESSED',
      severity: 'CRITICAL' as const,
      occurredAt: T0,
      ipKey: null,
      loginNormalized: null,
      userId: null,
      honeytokenId: null,
      details: {},
      requestId: 'request',
    };

    await expect(new WebhookAlertDispatcher(db, {}).send(record)).resolves.toEqual({
      outcome: 'SUPPRESSED',
    });
    await expect(
      new WebhookAlertDispatcher(db, {
        ALERT_WEBHOOK_URL: 'https://webhook-stub.test/events',
      }).send({ ...record, severity: 'INFO' }),
    ).resolves.toEqual({ outcome: 'SUPPRESSED' });
    await expect(
      new WebhookAlertDispatcher(db, {
        NODE_ENV: 'production',
        ALERT_WEBHOOK_URL: 'http://webhook-stub.test/events',
      }).send(record),
    ).rejects.toThrow(/HTTPS/);
  });

  it('bounds a retry with the default jitter and delay implementations', async () => {
    vi.useFakeTimers();
    const fetchStub = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchStub);
    const dispatcher = new WebhookAlertDispatcher(db, {
      NODE_ENV: 'test',
      ALERT_WEBHOOK_URL: 'http://webhook-stub.test/events',
    });
    const record = {
      id: 'event',
      type: 'DECOY_RESOURCE_ACCESSED',
      severity: 'CRITICAL' as const,
      occurredAt: T0,
      ipKey: null,
      loginNormalized: null,
      userId: null,
      honeytokenId: null,
      details: {},
      requestId: 'request',
    };

    const delivery = expect(dispatcher.send(record)).rejects.toThrow(
      'Alert webhook delivery failed.',
    );
    await vi.advanceTimersByTimeAsync(125);

    await delivery;
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });
});
