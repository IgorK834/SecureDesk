import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../tests/helpers/fake-clock';
import { seedWorld, signInAs } from '../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../server/db/client';
import { loginAttempts, securityEvents, users } from '../../../server/db/schema';
import {
  recordIpFailure,
  reserveCredentialAttempt,
  resolveAttempt,
} from '../../../server/security/attempt-tracker';
import * as ipBlockRoute from './ip-blocks/[ipKey]/route';
import * as ipBlocksRoute from './ip-blocks/route';
import * as unlockRoute from './users/[id]/unlock/route';
import * as usersRoute from './users/route';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);
let ids: Record<string, string>;

setUpSharedTestDb();

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  ids = seedWorld(db);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const asUser = (login?: string): ApiClient => {
  const client = createApiClient();
  if (login) client.signIn(signInAs(db, ids[login] as string));
  return client;
};

const failLogin = (loginNormalized: string, ipKey = '203.0.113.7') => {
  const reservation = reserveCredentialAttempt(db, {
    loginNormalized,
    ipKey,
    now: T0,
    maxAttempts: 5,
  });
  if (reservation.status !== 'reserved') throw new Error('expected reservation');
  resolveAttempt(db, reservation.attemptId, 'FAILED', {
    now: T0,
    maxAttempts: 5,
    requestId: `failure-${loginNormalized}`,
  });
};

const unlock = (client: ApiClient, id: string) =>
  client.post(unlockRoute, `/api/admin/users/${id}/unlock`, { params: { id } });
const listUsers = (client: ApiClient, query = '') =>
  client.get(usersRoute, `/api/admin/users${query}`);
const listIpBlocks = (client: ApiClient) => client.get(ipBlocksRoute, '/api/admin/ip-blocks');
const clearIpBlock = (client: ApiClient, ipKey: string) =>
  client.delete(ipBlockRoute, `/api/admin/ip-blocks/${encodeURIComponent(ipKey)}`, {
    params: { ipKey },
  });

describe('administrator account unlock', () => {
  it('SEC-38 shows and filters the lock, then clears its counter immediately and records the actor', async () => {
    const employeeId = ids.employee1 as string;
    const loginNormalized = db
      .select({ login: users.loginNormalized })
      .from(users)
      .where(eq(users.id, employeeId))
      .get()?.login;
    if (!loginNormalized) throw new Error('seeded user missing');
    for (let count = 0; count < 5; count++) failLogin(loginNormalized);

    const locked = await listUsers(asUser('ADMIN'), '?status=locked&page=1&pageSize=20');
    const lockedBody = (await locked.json()) as { items: { id: string; lockedUntil: string }[] };
    expect(lockedBody.items).toHaveLength(1);
    expect(lockedBody.items[0]).toMatchObject({
      id: employeeId,
      lockedUntil: '2030-01-01T00:15:00.000Z',
    });

    const response = await unlock(asUser('ADMIN'), employeeId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: employeeId, lockedUntil: null });
    expect(
      reserveCredentialAttempt(db, {
        loginNormalized,
        ipKey: '203.0.113.7',
        now: T0,
        maxAttempts: 5,
      }).status,
    ).toBe('reserved');

    const event = db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, 'ACCOUNT_UNLOCKED_BY_ADMIN'))
      .get();
    expect(event).toMatchObject({ userId: employeeId });
    expect(JSON.parse(event?.details ?? '{}')).toStrictEqual({ adminId: ids.ADMIN });
  });

  it('is idempotent and refuses every non-administrator role', async () => {
    const employeeId = ids.employee1 as string;
    expect((await unlock(asUser('ADMIN'), employeeId)).status).toBe(200);
    expect((await unlock(asUser('ADMIN'), employeeId)).status).toBe(200);
    for (const login of ['manager1', 'employee1', 'guest1']) {
      expect((await unlock(asUser(login), employeeId)).status).toBe(403);
    }
  });
});

describe('administrator address-block management', () => {
  it('lists a live block, clears it, and records the acting administrator', async () => {
    for (let count = 0; count < 20; count++) {
      recordIpFailure(db, { ipKey: '203.0.113.7', kind: 'HONEYPOT', now: T0 });
    }

    const listed = await listIpBlocks(asUser('ADMIN'));
    expect(listed.status).toBe(200);
    expect(await listed.json()).toStrictEqual({
      items: [
        {
          ipKey: '203.0.113.7',
          failedAttempts: 20,
          lockedUntil: '2030-01-01T00:15:00.000Z',
        },
      ],
    });

    const cleared = await clearIpBlock(asUser('ADMIN'), '203.0.113.7');
    expect(cleared.status).toBe(204);
    expect(await (await listIpBlocks(asUser('ADMIN'))).json()).toStrictEqual({ items: [] });
    expect(db.select().from(loginAttempts).all().at(-1)).toMatchObject({
      ipKey: '203.0.113.7',
      kind: 'MARKER',
      outcome: 'CLEARED',
    });
    const event = db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, 'IP_BLOCK_CLEARED_BY_ADMIN'))
      .get();
    expect(JSON.parse(event?.details ?? '{}')).toStrictEqual({
      adminId: ids.ADMIN,
      clearedIpKey: '203.0.113.7',
    });
  });

  it('refuses read and clear to every non-administrator role', async () => {
    for (const login of ['manager1', 'employee1', 'guest1']) {
      expect((await listIpBlocks(asUser(login))).status).toBe(403);
      expect((await clearIpBlock(asUser(login), '203.0.113.7')).status).toBe(403);
    }
  });
});
