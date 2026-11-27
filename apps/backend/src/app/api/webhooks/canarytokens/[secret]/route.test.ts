import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../../../../tests/helpers/fake-clock';
import { setUpSharedTestDb } from '../../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../../server/db/client';
import {
  auditLog,
  canaryWebhookReceipts,
  honeytokens,
  securityEvents,
} from '../../../../../server/db/schema';
import { ACCOUNT_TRAP_ID, seedHoneytokens } from '../../../../../server/db/seeds/honeytokens';
import {
  clearAlertDispatchers,
  registerAlertDispatcher,
} from '../../../../../server/security/alerts';
import { flushPendingAlerts } from '../../../../../server/security/events';
import { POST } from './route';

const pathKey = 'fixture-incoming-path-secret';
const outbound = vi.fn();
const logger = vi.fn();
const clock = new FakeClock();
let start = Date.parse('2030-01-01T00:00:00.000Z');
const fixture = {
  channel: 'HTTP',
  token_type: 'web',
  time: '2030-01-01T12:00:00.123456',
  memo: 'securedesk:' + ACCOUNT_TRAP_ID,
  src_ip: '192.0.2.44',
  token: 'mock-provider-sensitive-id',
  manage_url: 'https://canary.example.invalid/manage-sensitive-fixture',
  additional_data: { new_field: 'extra provider data', secret: 'payload-only-value' },
};
setUpSharedTestDb();
beforeEach(() => {
  start += 10 * 60_000;
  clock.set(new Date(start));
  clock.install();
  vi.stubEnv('CANARYTOKENS_WEBHOOK_SECRET', pathKey);
  db.transaction(seedHoneytokens);
  outbound.mockClear();
  logger.mockClear();
  vi.spyOn(console, 'info').mockImplementation(logger);
  registerAlertDispatcher({ id: 'outbound-fixture', send: outbound });
});
afterEach(() => {
  clearAlertDispatchers();
  clock.uninstall();
  vi.restoreAllMocks();
});

function post({
  secret = pathKey,
  body = JSON.stringify(fixture),
  contentType = 'application/json',
  contentLength,
}: {
  secret?: string;
  body?: string;
  contentType?: string;
  contentLength?: string;
} = {}) {
  return POST(
    new NextRequest(new URL('/api/webhooks/canarytokens/' + secret, 'http://localhost'), {
      method: 'POST',
      body,
      headers: {
        'Content-Type': contentType,
        ...(contentLength && { 'Content-Length': contentLength }),
      },
    }),
    { params: Promise.resolve({ secret }) },
  );
}

it('SEC-94 records one critical event and receipt, suppresses replays and never dispatches or echoes sensitive fields', async () => {
  const responses = await Promise.all([post(), post()]);
  expect(responses.map(({ status }) => status)).toEqual([204, 204]);
  expect(await responses[0]!.text()).toBe('');
  const audit = db.select().from(auditLog).all();
  const events = db.select().from(securityEvents).all();
  expect(audit).toHaveLength(1);
  expect(audit[0]).toMatchObject({
    action: 'HONEYTOKEN_ALERT_RECEIVED',
    actorType: 'SYSTEM',
    outcome: 'SUCCESS',
    details: JSON.stringify({ source: 'CANARYTOKENS_WEBHOOK', trapKind: 'ACCOUNT_TRAP' }),
  });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    type: 'HONEYTOKEN_TRIGGERED',
    severity: 'CRITICAL',
    alertStatus: 'SUPPRESSED',
    requestId: audit[0]!.requestId,
    honeytokenId: ACCOUNT_TRAP_ID,
  });
  expect(JSON.parse(events[0]!.details)).toEqual({
    source: 'CANARYTOKENS_WEBHOOK',
    trapKind: 'ACCOUNT_TRAP',
  });
  const trap = db
    .select()
    .from(honeytokens)
    .all()
    .find((item) => item.id === ACCOUNT_TRAP_ID);
  expect(trap).toMatchObject({ triggerCount: 1, lastTriggeredAt: clock.now() });
  const storage = JSON.stringify({
    audit,
    events,
    logs: logger.mock.calls,
    receipts: db.select().from(canaryWebhookReceipts).all(),
  });
  for (const sensitive of [
    pathKey,
    fixture.token,
    fixture.manage_url,
    'payload-only-value',
    fixture.src_ip,
  ]) {
    expect(storage).not.toContain(sensitive);
  }
  await flushPendingAlerts();
  expect(outbound).not.toHaveBeenCalled();

  clock.advance(5 * 60_000 - 1);
  expect((await post()).status).toBe(204);
  expect(db.select().from(auditLog).all()).toHaveLength(1);
  clock.advance(1);
  expect((await post()).status).toBe(204);
  expect(db.select().from(auditLog).all()).toHaveLength(2);
  expect(db.select().from(canaryWebhookReceipts).all()).toHaveLength(1);
});

it('SEC-94 refuses bad secrets before parsing and rejects non-JSON, invalid and oversized envelopes', async () => {
  const large = JSON.stringify({ ...fixture, padding: 'é'.repeat(8300) });
  expect(
    (await post({ secret: 'wrong-fixture-secret', body: large, contentType: 'text/plain' })).status,
  ).toBe(404);
  expect((await post({ body: large })).status).toBe(413);
  expect((await post({ contentLength: '20000' })).status).toBe(413);
  expect((await post({ contentType: 'text/plain' })).status).toBe(415);
  expect((await post({ body: 'not-json' })).status).toBe(400);
  expect(
    (await post({ body: JSON.stringify({ memo: fixture.memo, time: 'invalid' }) })).status,
  ).toBe(400);
  expect(
    (await post({ body: JSON.stringify({ ...fixture, memo: 'securedesk:unknown' }) })).status,
  ).toBe(404);
  vi.stubEnv('CANARYTOKENS_WEBHOOK_SECRET', '');
  expect((await post()).status).toBe(404);
  expect(db.select().from(auditLog).all()).toEqual([]);
  expect(JSON.stringify(logger.mock.calls)).not.toContain(pathKey);
});

it('SEC-94 acknowledges the provider setup probe and limits authenticated requests before reading a body', async () => {
  const probe = JSON.stringify({
    ...fixture,
    memo: 'Congrats! The newly saved webhook works',
    token: 'a+test+token',
  });
  for (let i = 0; i < 60; i++) expect((await post({ body: probe })).status).toBe(204);
  const refused = await post({ body: 'unread', contentType: 'text/plain' });
  expect(refused.status).toBe(429);
  expect(refused.headers.get('retry-after')).toBe('60');
  expect(db.select().from(auditLog).all()).toEqual([]);
  expect(db.select().from(securityEvents).all()).toEqual([]);
});
