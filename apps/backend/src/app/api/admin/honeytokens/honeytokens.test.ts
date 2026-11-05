import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../../tests/helpers/api-client';
import { seedWorld, signInAs } from '../../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../server/db/client';
import { honeytokens, securityEvents } from '../../../../server/db/schema';
import {
  ACCOUNT_TRAP_ALERT_ENV,
  ACCOUNT_TRAP_ID,
  seedHoneytokens,
} from '../../../../server/db/seeds/honeytokens';
import { clearAlertDispatchers } from '../../../../server/security/alerts';
import { flushPendingAlerts } from '../../../../server/security/events';
import * as testRoute from './[id]/test/route';
import * as listRoute from './route';

setUpSharedTestDb();
let ids: Record<string, string>;

beforeEach(() => {
  ids = seedWorld(db);
  db.transaction((tx) => seedHoneytokens(tx));
  clearAlertDispatchers();
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CANARY_ALERTS_ENABLED', 'true');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(async () => {
  await flushPendingAlerts();
  clearAlertDispatchers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const asUser = (login?: string): ApiClient => {
  const client = createApiClient();
  if (login) client.signIn(signInAs(db, ids[login] as string));
  return client;
};

describe('GET /api/admin/honeytokens', () => {
  it('returns only the six public status fields and never configured secrets', async () => {
    vi.stubEnv(ACCOUNT_TRAP_ALERT_ENV, 'http://private-provider.test/secret-path');
    vi.stubEnv('CANARY_DECOY_AWS_ACCESS_KEY_ID', 'private-access-value');
    vi.stubEnv('CANARY_DECOY_AWS_SECRET_ACCESS_KEY', 'private-secret-value');

    const response = await asUser('ADMIN').get(listRoute, '/api/admin/honeytokens');
    const text = await response.text();
    const body = JSON.parse(text) as { items: Record<string, unknown>[] };

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(2);
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toStrictEqual([
        'enabled',
        'id',
        'kind',
        'label',
        'lastTriggeredAt',
        'triggerCount',
      ]);
    }
    expect(text).not.toMatch(
      /private-provider|secret-path|private-access-value|private-secret-value|CANARY_ACCOUNT_TRAP_URL/,
    );
  });

  it.each(['manager1', 'employee1', 'guest1'])('%s receives 403', async (login) => {
    expect((await asUser(login).get(listRoute, '/api/admin/honeytokens')).status).toBe(403);
  });
});

describe('POST /api/admin/honeytokens/:id/test', () => {
  it('writes an INFO test event, sends one marked call, and does not increment the trigger count', async () => {
    vi.stubEnv(ACCOUNT_TRAP_ALERT_ENV, 'http://canary-stub.test/test-alert');
    const fetchStub = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);
    const before = db.select().from(honeytokens).where(eq(honeytokens.id, ACCOUNT_TRAP_ID)).get();

    const response = await asUser('ADMIN').post(
      testRoute,
      `/api/admin/honeytokens/${ACCOUNT_TRAP_ID}/test`,
      { params: { id: ACCOUNT_TRAP_ID } },
    );
    await flushPendingAlerts();

    expect(response.status).toBe(202);
    expect(await response.json()).toStrictEqual({ eventId: expect.any(String), test: true });
    expect(fetchStub).toHaveBeenCalledOnce();
    const [, init] = fetchStub.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>)['user-agent']).toMatch(/Honeytoken.*TEST/);
    const event = db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, 'HONEYTOKEN_TESTED'))
      .get();
    expect(event).toMatchObject({
      severity: 'INFO',
      honeytokenId: ACCOUNT_TRAP_ID,
      userId: ids['ADMIN'],
      alertStatus: 'SENT',
    });
    expect(JSON.parse(event?.details ?? '{}')).toStrictEqual({
      test: true,
      trapKind: 'ACCOUNT_TRAP',
    });
    expect(
      db.select().from(honeytokens).where(eq(honeytokens.id, ACCOUNT_TRAP_ID)).get(),
    ).toMatchObject({
      triggerCount: before?.triggerCount,
      lastTriggeredAt: before?.lastTriggeredAt,
    });
  });

  it('refuses other roles and an unknown id', async () => {
    expect(
      (
        await asUser('manager1').post(testRoute, `/api/admin/honeytokens/${ACCOUNT_TRAP_ID}/test`, {
          params: { id: ACCOUNT_TRAP_ID },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await asUser('ADMIN').post(testRoute, '/api/admin/honeytokens/missing/test', {
          params: { id: 'missing' },
        })
      ).status,
    ).toBe(404);
  });
});
