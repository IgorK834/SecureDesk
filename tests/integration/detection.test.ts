import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import * as audit from '../../apps/backend/src/app/api/admin/audit-log/route';
import * as rules from '../../apps/backend/src/app/api/admin/detection-rules/route';
import * as events from '../../apps/backend/src/app/api/admin/security-events/route';
import * as login from '../../apps/backend/src/app/api/auth/login/route';
import { hashPassword } from '../../apps/backend/src/server/auth/password-hasher';
import { seedWorld, signInAs } from '../../apps/backend/src/server/db/__fixtures__/seeded-world';
import { db } from '../../apps/backend/src/server/db/client';
import { runMigrations } from '../../apps/backend/src/server/db/migrate';
import {
  auditLog,
  securityEvents,
  securitySettings,
  users,
} from '../../apps/backend/src/server/db/schema';
import { clearAlertDispatchers } from '../../apps/backend/src/server/security/alerts';
import { issueInternalChallenge } from '../../apps/backend/src/server/security/captcha/internal';
import { flushPendingAlerts } from '../../apps/backend/src/server/security/events';
import { createApiClient } from '../helpers/api-client';
import { FakeClock } from '../helpers/fake-clock';

const clock = new FakeClock();
const password = 'Fixture login password!29';
const ip = '192.0.2.70';
let hash: string;
let folder: string;
let ids: Record<string, string>;
const globals = globalThis as typeof globalThis & { __securedeskDb?: unknown };

beforeAll(async () => {
  hash = await hashPassword(password);
});
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'securedesk-detection-routes-'));
  vi.stubEnv('TEST_DATABASE_PATH', join(folder, 'routes.sqlite'));
  vi.stubEnv('ALERT_FILE_PATH', '');
  vi.stubEnv('ALERT_WEBHOOK_URL', '');
  vi.stubEnv('CAPTCHA_LOGIN_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_HMAC_SECRET', 'fixture-hmac-key-for-detection-tests');
  vi.stubEnv('TRUST_PROXY', 'true');
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
  clock.set('2030-01-01T00:00:00.000Z');
  clock.install();
  runMigrations(db);
  ids = seedWorld(db);
  db.update(users).set({ passwordHash: hash }).where(eq(users.id, ids.employee1!)).run();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(async () => {
  await settled();
  db.$client.close();
  delete globals.__securedeskDb;
  clearAlertDispatchers();
  clock.uninstall();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(folder, { recursive: true, force: true });
});

async function settled() {
  await setImmediate();
  await flushPendingAlerts();
}
function signIn(entered = 'Wrong fixture password!37') {
  const issued = issueInternalChallenge(
    db,
    { purpose: 'login', ipKey: ip, now: clock.now() },
    process.env,
  );
  return createApiClient().post(login, '/api/auth/login', {
    headers: { 'x-forwarded-for': ip },
    json: {
      login: 'employee1',
      password: entered,
      captcha: {
        challengeId: issued.publicChallenge.challengeId,
        answer: issued.expectedAnswer,
      },
    },
  });
}

it('SEC-89 three wrong credentials and two lock refusals raise rule one via the real login route', async () => {
  db.insert(securitySettings).values({ id: 1, maxFailedLoginAttempts: 3 }).run();
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await signIn()).status);
  expect(statuses).toEqual([401, 401, 429, 429, 429]);
  await settled();
  const failures = db
    .select()
    .from(auditLog)
    .where(eq(auditLog.action, 'AUTH_LOGIN_FAILURE'))
    .all();
  expect(failures.map(({ details }) => JSON.parse(details).reason)).toEqual([
    'BAD_CREDENTIALS',
    'BAD_CREDENTIALS',
    'BAD_CREDENTIALS',
    'ACCOUNT_LOCKED',
    'ACCOUNT_LOCKED',
  ]);
  const alerts = db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.type, 'DETECTION_ALERT'))
    .all();
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toMatchObject({ alertStatus: 'SENT', severity: 'WARNING' });

  const admin = createApiClient().signIn(signInAs(db, ids.ADMIN!));
  const response = await admin.get(rules, '/api/admin/detection-rules');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    items: [
      {
        id: 'FAILED_LOGIN_BURST',
        threshold: 5,
        windowMinutes: 5,
        lastAlertAt: clock.now().toISOString(),
      },
      { id: 'SUCCESS_AFTER_FAILURES', threshold: 3, windowMinutes: 10, lastAlertAt: null },
    ],
  });
  const eventResponse = await admin.get(events, '/api/admin/security-events?type=DETECTION_ALERT');
  const [alert] = (await eventResponse.json()).items;
  const { firstSeq, lastSeq } = alert.detection;
  expect(alert.detection.title).toBe('Burst of failed logins');
  const page = await admin.get(
    audit,
    '/api/admin/audit-log?fromSeq=' + firstSeq + '&toSeq=' + lastSeq,
  );
  expect((await page.json()).items.map(({ seq }: { seq: number }) => seq)).toEqual(
    Array.from({ length: lastSeq - firstSeq + 1 }, (_, i) => lastSeq - i),
  );
  expect((await admin.get(audit, '/api/admin/audit-log?fromSeq=20&toSeq=1')).status).toBe(400);
});

it('SEC-92 a failed file dispatch leaves the login response and the critical event intact', async () => {
  const blocked = join(folder, 'blocked');
  mkdirSync(blocked);
  chmodSync(blocked, 0o500);
  vi.stubEnv('ALERT_FILE_PATH', join(blocked, 'alerts.jsonl'));
  try {
    for (let i = 0; i < 3; i++) expect((await signIn()).status).toBe(401);
    const response = await signIn(password);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(2);
    await settled();
    const [event] = db
      .select()
      .from(securityEvents)
      .where(eq(securityEvents.type, 'DETECTION_ALERT'))
      .all();
    expect(event).toMatchObject({ severity: 'CRITICAL', alertStatus: 'FAILED' });
    expect(
      db.select().from(auditLog).where(eq(auditLog.action, 'ALERT_RAISED')).all(),
    ).toHaveLength(1);
  } finally {
    chmodSync(blocked, 0o700);
  }
});
