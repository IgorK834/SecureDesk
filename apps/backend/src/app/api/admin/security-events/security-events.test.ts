import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { seedWorld, signInAs } from '../../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../server/db/client';
import { securityEvents } from '../../../../server/db/schema';
import { clearAlertDispatchers } from '../../../../server/security/alerts';
import { recordSecurityEvent } from '../../../../server/security/events';
import * as acknowledgeRoute from './[id]/acknowledge/route';
import * as listRoute from './route';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);
setUpSharedTestDb();
let ids: Record<string, string>;

beforeEach(() => {
  ids = seedWorld(db);
  fakeClock.set(T0);
  fakeClock.install();
  clearAlertDispatchers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  clearAlertDispatchers();
  vi.restoreAllMocks();
});

const asUser = (login?: string): ApiClient => {
  const client = createApiClient();
  if (login) client.signIn(signInAs(db, ids[login] as string));
  return client;
};
const list = (client: ApiClient, query = '') =>
  client.get(listRoute, `/api/admin/security-events${query}`);
const acknowledge = (client: ApiClient, id: string) =>
  client.post(acknowledgeRoute, `/api/admin/security-events/${id}/acknowledge`, {
    params: { id },
  });

function add(type: 'ACCOUNT_LOCKED' | 'HONEYTOKEN_TRIGGERED', requestId: string) {
  return recordSecurityEvent(
    db,
    type === 'ACCOUNT_LOCKED'
      ? {
          type,
          requestId,
          ipKey: '198.51.100.10',
          details: { attempts: 5, lockedUntil: '2030-01-01T00:15:00.000Z' },
        }
      : {
          type,
          requestId,
          ipKey: '198.51.100.11',
          details: { trapKind: 'ACCOUNT_TRAP' },
        },
  ) as string;
}

describe('GET /api/admin/security-events', () => {
  it('SEC-58 lists newest first and filters with a strict bounded query', async () => {
    const older = add('ACCOUNT_LOCKED', 'older');
    fakeClock.advance(1_000);
    const newer = add('HONEYTOKEN_TRIGGERED', 'newer');
    const admin = asUser('ADMIN');

    const all = await list(admin, '?page=1&pageSize=100');
    expect(all.status).toBe(200);
    expect(all.headers.get('cache-control')).toBe('no-store');
    expect(await all.json()).toMatchObject({
      items: [{ id: newer }, { id: older }],
      page: 1,
      pageSize: 100,
      total: 2,
    });

    const filtered = await list(
      admin,
      '?type=HONEYTOKEN_TRIGGERED&severity=CRITICAL&acknowledged=false&from=2030-01-01T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A01.000Z&page=1&pageSize=1',
    );
    expect(await filtered.json()).toMatchObject({ items: [{ id: newer }], total: 1 });

    for (const query of [
      '?unknown=x',
      '?page=0',
      '?pageSize=101',
      '?severity=LOW',
      '?acknowledged=yes',
      '?from=not-a-date',
      '?from=2030-01-02T00%3A00%3A00.000Z&to=2030-01-01T00%3A00%3A00.000Z',
    ]) {
      expect((await list(admin, query)).status, query).toBe(400);
    }
  });

  it('exposes total for the unacknowledged CRITICAL banner even with pageSize one', async () => {
    add('HONEYTOKEN_TRIGGERED', 'critical-1');
    fakeClock.advance(1);
    add('HONEYTOKEN_TRIGGERED', 'critical-2');

    const response = await list(
      asUser('ADMIN'),
      '?severity=CRITICAL&acknowledged=false&page=1&pageSize=1',
    );

    expect(await response.json()).toMatchObject({ items: [expect.any(Object)], total: 2 });
  });

  it.each(['manager1', 'employee1', 'guest1'])('%s receives 403', async (login) => {
    expect((await list(asUser(login))).status).toBe(403);
  });

  it('answers anonymous callers with 401', async () => {
    expect((await list(asUser())).status).toBe(401);
  });

  it('serializes only allowlisted fields and drops invalid stored details and raw attacker text', async () => {
    db.insert(securityEvents)
      .values({
        id: '10101010-1010-4010-8010-101010101010',
        type: 'ACCOUNT_LOCKED',
        severity: 'WARNING',
        occurredAt: T0,
        ipKey: '198.51.100.12',
        userAgent: 'credential-value-sentinel',
        loginNormalized: 'private-login-sentinel',
        details: JSON.stringify({ password: 'credential-value-sentinel' }),
        requestId: 'request-safe',
      })
      .run();

    const response = await list(asUser('ADMIN'));
    const text = await response.text();
    const page = JSON.parse(text) as { items: Record<string, unknown>[] };
    expect(text).not.toMatch(/credential-value-sentinel|private-login-sentinel/);
    expect(Object.keys(page.items[0] as object).sort()).toStrictEqual([
      'acknowledgedAt',
      'acknowledgedBy',
      'alertAttemptedAt',
      'alertStatus',
      'details',
      'id',
      'ipKey',
      'occurredAt',
      'requestId',
      'severity',
      'subjectUserId',
      'type',
    ]);
    expect(page.items[0]?.['details']).toStrictEqual({});
    const walkKeys = (value: unknown): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, inner]) => [key, ...walkKeys(inner)])
        : [];
    expect(
      walkKeys(page).filter((key) => /password|token|secret|answer|captcha/i.test(key)),
    ).toEqual([]);
  });
});

describe('POST /api/admin/security-events/:id/acknowledge', () => {
  it('is idempotent, records the first administrator and time, and preserves details byte-for-byte', async () => {
    const id = add('HONEYTOKEN_TRIGGERED', 'ack-me');
    const before = db.select().from(securityEvents).where(eq(securityEvents.id, id)).get();
    const admin = asUser('ADMIN');

    const first = await acknowledge(admin, id);
    fakeClock.advance(60_000);
    const second = await acknowledge(admin, id);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({
      id,
      acknowledgedAt: T0.toISOString(),
      acknowledgedBy: ids['ADMIN'],
    });
    expect(await second.json()).toMatchObject({ acknowledgedAt: T0.toISOString() });
    const after = db.select().from(securityEvents).where(eq(securityEvents.id, id)).get();
    expect(after?.details).toBe(before?.details);
    expect(after?.acknowledgedAt).toEqual(T0);
    expect(after?.acknowledgedBy).toBe(ids['ADMIN']);
  });

  it('refuses other roles and missing or malformed ids', async () => {
    const id = add('ACCOUNT_LOCKED', 'protected');
    expect((await acknowledge(asUser('manager1'), id)).status).toBe(403);
    expect((await acknowledge(asUser(), id)).status).toBe(401);
    expect((await acknowledge(asUser('ADMIN'), 'not-a-uuid')).status).toBe(400);
    expect(
      (await acknowledge(asUser('ADMIN'), '20202020-2020-4020-8020-202020202020')).status,
    ).toBe(404);
  });
});
