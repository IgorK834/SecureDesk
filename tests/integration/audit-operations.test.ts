import { eq } from 'drizzle-orm';
import { generate } from 'otplib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as settings from '../../apps/backend/src/app/api/admin/security-settings/route';
import * as resetPassword from '../../apps/backend/src/app/api/admin/users/[id]/reset-password/route';
import * as resetTotp from '../../apps/backend/src/app/api/admin/users/[id]/reset-totp/route';
import * as account from '../../apps/backend/src/app/api/admin/users/[id]/route';
import * as block from '../../apps/backend/src/app/api/admin/users/[id]/block/route';
import * as unblock from '../../apps/backend/src/app/api/admin/users/[id]/unblock/route';
import * as unlock from '../../apps/backend/src/app/api/admin/users/[id]/unlock/route';
import * as accounts from '../../apps/backend/src/app/api/admin/users/route';
import * as initialChange from '../../apps/backend/src/app/api/auth/change-initial-password/route';
import * as change from '../../apps/backend/src/app/api/auth/change-password/route';
import * as login from '../../apps/backend/src/app/api/auth/login/route';
import * as logout from '../../apps/backend/src/app/api/auth/logout/route';
import * as me from '../../apps/backend/src/app/api/auth/me/route';
import * as challengeTotp from '../../apps/backend/src/app/api/auth/totp/challenge/route';
import * as disableTotp from '../../apps/backend/src/app/api/auth/totp/disable/route';
import * as enrollTotp from '../../apps/backend/src/app/api/auth/totp/enroll/route';
import * as verifyEnrollment from '../../apps/backend/src/app/api/auth/totp/verify-enrollment/route';
import * as decoy from '../../apps/backend/src/app/api/backup/config/route';
import * as ticket from '../../apps/backend/src/app/api/tickets/[id]/route';
import { hashPassword } from '../../apps/backend/src/server/auth/password-hasher';
import {
  hashSessionToken,
  SESSION_ABSOLUTE_LIFETIME_MS,
} from '../../apps/backend/src/server/auth/session-service';
import { seedWorld, signInAs } from '../../apps/backend/src/server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../apps/backend/src/server/db/__fixtures__/shared-test-db';
import { rejectAuditInserts } from '../../apps/backend/src/server/db/__fixtures__/test-db';
import { db } from '../../apps/backend/src/server/db/client';
import {
  auditLog,
  loginAttempts,
  securityEvents,
  securitySettings,
  tickets,
  users,
  type AuthStage,
} from '../../apps/backend/src/server/db/schema';
import { seedHoneytokens } from '../../apps/backend/src/server/db/seeds/honeytokens';
import { issueInternalChallenge } from '../../apps/backend/src/server/security/captcha/internal';
import { flushPendingAlerts } from '../../apps/backend/src/server/security/events';
import { createApiClient } from '../helpers/api-client';
import { FakeClock } from '../helpers/fake-clock';

const NOW = new Date('2026-11-26T09:15:00.000Z');
const clock = new FakeClock(NOW);
const IP = '2001:db8:1::1234';
const forwarded = { 'x-forwarded-for': '192.0.2.123, ' + IP };
const PASSWORD = 'A synthetic credential for audit tests';
const WRONG = 'An unrelated incorrect credential';
const IP_KEY = '2001:db8:1:0::/64';
const NEW_PASSWORD = 'A distinct replacement credential';

let hash: string;
let ids: Record<string, string>;
setUpSharedTestDb();

beforeAll(async () => {
  hash = await hashPassword(PASSWORD);
});
beforeEach(() => {
  clock.set(NOW);
  clock.install();
  ids = seedWorld(db);
  db.update(users).set({ passwordHash: hash }).where(eq(users.id, ids.employee1!)).run();
  vi.stubEnv('TRUST_PROXY', 'true');
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
  vi.stubEnv('CAPTCHA_LOGIN_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'internal');
  vi.stubEnv('CAPTCHA_HMAC_SECRET', 'synthetic-hmac-key-for-audit-tests');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  clock.uninstall();
  vi.restoreAllMocks();
});

const asUser = (loginName: string, stage?: AuthStage) =>
  createApiClient().signIn(signInAs(db, ids[loginName]!, stage));
const auditRows = () => db.select().from(auditLog).orderBy(auditLog.seq).all();
const details = (row: { details: string }) => JSON.parse(row.details);
const user = (id: string) => db.select().from(users).where(eq(users.id, id)).get();
const userPath = (id: string, suffix = '') => '/api/admin/users/' + id + suffix;
const target = (id: string) => ({ params: { id }, headers: forwarded });
function captcha(purpose: 'login' | 'change-password') {
  const issued = issueInternalChallenge(
    db,
    { purpose, ipKey: IP_KEY, now: clock.now() },
    process.env,
  );
  return { challengeId: issued.publicChallenge.challengeId, answer: issued.expectedAnswer };
}

const credentialsChange = () => ({
  currentPassword: PASSWORD,
  newPassword: NEW_PASSWORD,
  confirmNewPassword: NEW_PASSWORD,
  captcha: captcha('change-password'),
});

function loginAttempt(loginName: string, password = WRONG, fields: Record<string, unknown> = {}) {
  return createApiClient().post(login, '/api/auth/login', {
    headers: forwarded,
    json: {
      login: loginName,
      password,
      captcha: Object.hasOwn(fields, 'captcha') ? undefined : captcha('login'),
      ...fields,
    },
  });
}

describe('authentication audit events', () => {
  it('SEC-63, SEC-64 and SEC-67 record login outcomes, account lock and trap without credential material', async () => {
    db.insert(securitySettings).values({ id: 1, maxFailedLoginAttempts: 3 }).run();
    db.transaction(seedHoneytokens);
    const success = await loginAttempt('employee1', PASSWORD);
    const cookie = success.headers
      .getSetCookie()
      .find((value) => value.startsWith('__Host-sd_session='));
    const token = cookie?.split(';')[0]?.split('=')[1];
    expect(success.status).toBe(200);
    expect(token).toBeTruthy();

    expect((await loginAttempt('employee1')).status).toBe(401);
    const unknown = await loginAttempt('private-unknown-input');
    const trap = await loginAttempt('backup_admin');
    expect([unknown.status, trap.status]).toEqual([401, 401]);
    expect(await trap.text()).toBe(await unknown.text());
    expect((await loginAttempt('employee1', WRONG, { captcha: undefined })).status).toBe(400);
    expect((await loginAttempt('private-unknown-input', WRONG, { website: 'filled' })).status).toBe(
      401,
    );
    expect((await loginAttempt('employee1')).status).toBe(401);
    expect((await loginAttempt('employee1')).status).toBe(429);
    expect((await loginAttempt('employee1', PASSWORD)).status).toBe(429);

    const rows = auditRows();
    expect(
      rows.map((row) => [row.action, row.outcome, details(row).reason, row.subjectLogin]),
    ).toEqual([
      ['AUTH_LOGIN_SUCCESS', 'SUCCESS', undefined, 'employee1'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'BAD_CREDENTIALS', 'employee1'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'BAD_CREDENTIALS', null],
      ['AUTH_TRAP_ACCOUNT_USED', 'FAILURE', 'TRAP_ACCOUNT', 'backup_admin'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'BAD_CREDENTIALS', 'backup_admin'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'CAPTCHA_FAILED', 'employee1'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'HONEYPOT', null],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'BAD_CREDENTIALS', 'employee1'],
      ['AUTH_ACCOUNT_LOCKED', 'SUCCESS', undefined, 'employee1'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'BAD_CREDENTIALS', 'employee1'],
      ['AUTH_LOGIN_FAILURE', 'FAILURE', 'ACCOUNT_LOCKED', 'employee1'],
    ]);
    expect(rows[0]).toMatchObject({
      actorType: 'USER',
      actorUserId: ids.employee1,
      actorLogin: 'employee1',
    });
    expect(rows[8]).toMatchObject({
      actorType: 'SYSTEM',
      details: '{"attempts":3,"lockedUntil":"2026-11-26T09:30:00.000Z"}',
    });
    expect(rows[8]?.requestId).toBe(rows[9]?.requestId);
    expect(rows[2]?.subjectRef).toMatch(/^ref:[a-f0-9]{16}$/);
    expect(rows[2]?.subjectRef).toBe(rows[6]?.subjectRef);
    expect(
      db
        .select()
        .from(securityEvents)
        .all()
        .map((row) => row.type),
    ).toContain('ACCOUNT_LOCKED');
    for (const row of rows) {
      expect(row).toMatchObject({
        occurredAt: NOW.toISOString(),
        ip: IP,
        description: expect.any(String),
      });
    }
    const stored = JSON.stringify(rows);
    for (const value of [
      PASSWORD,
      WRONG,
      hash,
      token!,
      hashSessionToken(token!),
      'private-unknown-input',
    ]) {
      expect(stored).not.toContain(value);
    }
  });

  it('records one IP block refusal per full address in a five-minute bucket across 1000 requests', async () => {
    db.insert(securitySettings).values({ id: 1, ipFailedAttemptLimit: 5 }).run();
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 5 }, () => ({
          kind: 'HONEYPOT' as const,
          outcome: 'FAILED' as const,
          ipKey: IP_KEY,
          occurredAt: NOW,
          resolvedAt: NOW,
        })),
      )
      .run();

    for (let i = 0; i < 1000; i++) {
      const response = await loginAttempt('private-blocked-input', WRONG, { captcha: undefined });
      expect(response.status).toBe(429);
    }
    expect(auditRows()).toMatchObject([
      {
        action: 'AUTH_LOGIN_FAILURE',
        details: '{"reason":"IP_BLOCKED"}',
        ip: IP,
        occurredAt: NOW.toISOString(),
        subjectLogin: null,
        subjectRef: expect.stringMatching(/^ref:/),
      },
    ]);

    clock.advance(5 * 60 * 1000);
    const response = await loginAttempt('private-blocked-input', WRONG, { captcha: undefined });
    expect(response.status).toBe(429);
    expect(auditRows()).toHaveLength(2);
  }, 20_000);

  it.each([
    ['IDLE', 15 * 60 * 1000],
    ['ABSOLUTE', SESSION_ABSOLUTE_LIFETIME_MS],
  ] as const)('records %s session expiry once with request metadata', async (kind, elapsed) => {
    const client = asUser('employee1');
    clock.advance(elapsed);
    for (let i = 0; i < 2; i++) {
      expect((await client.get(me, '/api/auth/me', { headers: forwarded })).status).toBe(401);
    }
    expect(auditRows()).toMatchObject([
      {
        action: 'AUTH_SESSION_EXPIRED',
        outcome: 'SUCCESS',
        actorType: 'SYSTEM',
        subjectLogin: 'employee1',
        ip: IP,
        occurredAt: new Date(NOW.getTime() + elapsed).toISOString(),
        details: JSON.stringify({ kind }),
      },
    ]);
  });

  it('records logout with the authenticated actor and prevents subsequent use of the session', async () => {
    const credentials = signInAs(db, ids.employee1!);
    const client = createApiClient().signIn(credentials);
    expect((await client.post(logout, '/api/auth/logout', { headers: forwarded })).status).toBe(
      204,
    );
    expect((await createApiClient().signIn(credentials).get(me, '/api/auth/me')).status).toBe(401);
    expect(auditRows()).toMatchObject([
      {
        action: 'AUTH_LOGOUT',
        actorType: 'USER',
        actorUserId: ids.employee1,
        actorLogin: 'employee1',
        ip: IP,
        outcome: 'SUCCESS',
        occurredAt: NOW.toISOString(),
      },
    ]);
    expect(JSON.stringify(auditRows())).not.toContain(credentials.token);
  });
});

describe('password audit events', () => {
  it.each([
    ['ORDINARY', 'FULLY_AUTHENTICATED'],
    ['EXPIRED', 'PASSWORD_EXPIRED'],
    ['INITIAL', 'INITIAL_PASSWORD_CHANGE'],
  ] as const)('SEC-68 records a successful %s change without credentials', async (kind, stage) => {
    if (kind === 'INITIAL')
      db.update(users).set({ mustChangePassword: true }).where(eq(users.id, ids.employee1!)).run();
    const client = asUser('employee1', stage);
    const response =
      kind === 'INITIAL'
        ? await client.post(initialChange, '/api/auth/change-initial-password', {
            headers: forwarded,
            json: {
              newPassword: NEW_PASSWORD,
              confirmNewPassword: NEW_PASSWORD,
              captcha: captcha('change-password'),
            },
          })
        : await client.post(change, '/api/auth/change-password', {
            headers: forwarded,
            json: credentialsChange(),
          });
    expect(response.status).toBe(200);
    const rows = auditRows();
    expect(rows).toMatchObject([
      {
        action: 'PASSWORD_CHANGED',
        outcome: 'SUCCESS',
        actorUserId: ids.employee1,
        subjectLogin: 'employee1',
        details: JSON.stringify({ kind }),
        occurredAt: NOW.toISOString(),
        ip: IP,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(PASSWORD);
    expect(JSON.stringify(rows)).not.toContain(NEW_PASSWORD);
    expect(JSON.stringify(rows)).not.toContain(hash);
  });

  it.each([
    ['CURRENT_PASSWORD_INCORRECT', { currentPassword: WRONG }],
    ['POLICY_VIOLATION', { newPassword: 'tiny', confirmNewPassword: 'tiny' }],
    ['REUSED', { newPassword: PASSWORD, confirmNewPassword: PASSWORD }],
    ['CAPTCHA_FAILED', { captcha: undefined }],
  ] as const)('SEC-68 records %s with only fixed reason data', async (reason, override) => {
    const response = await asUser('employee1').post(change, '/api/auth/change-password', {
      headers: forwarded,
      json: { ...credentialsChange(), ...override },
    });
    expect(response.status).toBe(400);
    const rows = auditRows();
    expect(rows).toMatchObject([
      {
        action: 'PASSWORD_CHANGE_FAILED',
        outcome: 'FAILURE',
        actorUserId: ids.employee1,
        subjectLogin: 'employee1',
      },
    ]);
    expect(details(rows[0]!)).toEqual(
      reason === 'POLICY_VIOLATION' ? { reason, violations: ['TOO_SHORT'] } : { reason },
    );
    const stored = JSON.stringify(rows);
    for (const value of [PASSWORD, WRONG, NEW_PASSWORD, hash]) expect(stored).not.toContain(value);
  });

  it('records expired temporary credentials and brute-force refusals', async () => {
    db.update(users)
      .set({ mustChangePassword: true, temporaryPasswordExpiresAt: NOW })
      .where(eq(users.id, ids.employee1!))
      .run();
    const expired = await asUser('employee1', 'INITIAL_PASSWORD_CHANGE').post(
      initialChange,
      '/api/auth/change-initial-password',
      {
        headers: forwarded,
        json: {
          newPassword: NEW_PASSWORD,
          confirmNewPassword: NEW_PASSWORD,
          captcha: captcha('change-password'),
        },
      },
    );
    expect(expired.status).toBe(401);

    db.insert(securitySettings).values({ id: 1, maxFailedLoginAttempts: 3 }).run();
    db.insert(loginAttempts)
      .values(
        Array.from({ length: 3 }, () => ({
          kind: 'PASSWORD_CHANGE' as const,
          outcome: 'FAILED' as const,
          ipKey: IP_KEY,
          loginNormalized: 'employee1',
          occurredAt: NOW,
          resolvedAt: NOW,
        })),
      )
      .run();
    const refused = await asUser('employee1').post(change, '/api/auth/change-password', {
      headers: forwarded,
      json: credentialsChange(),
    });
    expect(refused.status).toBe(429);
    expect(auditRows().map(details)).toEqual([
      { reason: 'TEMPORARY_PASSWORD_EXPIRED' },
      { reason: 'BRUTE_FORCE_LIMIT' },
    ]);
  });

  it('records an administrator reset with actor and target and leaves the temporary password out', async () => {
    const id = ids.employee1!;
    const response = await asUser('ADMIN').post(resetPassword, userPath(id, '/reset-password'), {
      ...target(id),
      json: {},
    });
    expect(response.status).toBe(200);
    const { temporaryPassword } = await response.json();
    const rows = auditRows();
    expect(rows).toMatchObject([
      {
        action: 'PASSWORD_RESET_BY_ADMIN',
        outcome: 'SUCCESS',
        actorUserId: ids.ADMIN,
        actorLogin: 'ADMIN',
        subjectLogin: 'employee1',
        ip: IP,
        details: '{}',
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(temporaryPassword.value);
    expect(JSON.stringify(rows)).not.toContain(user(id)?.passwordHash);
  });

  it('leaves no success entry when the credential swap fails', async () => {
    db.$client.exec(
      "CREATE TRIGGER test_swap_failure BEFORE UPDATE OF password_hash ON users BEGIN SELECT RAISE(ABORT, 'synthetic'); END;",
    );
    const response = await asUser('employee1').post(change, '/api/auth/change-password', {
      headers: forwarded,
      json: credentialsChange(),
    });
    expect(response.status).toBe(500);
    expect(user(ids.employee1!)?.passwordHash).toBe(hash);
    expect(auditRows()).toEqual([]);
  });

  it('records a refused administrator password reset for a missing target', async () => {
    const id = '00000000-0000-4000-8000-0000000000ff';
    const response = await asUser('ADMIN').post(resetPassword, userPath(id, '/reset-password'), {
      ...target(id),
      json: {},
    });
    expect(response.status).toBe(404);
    expect(auditRows()).toMatchObject([
      {
        action: 'PASSWORD_RESET_BY_ADMIN',
        outcome: 'FAILURE',
        actorUserId: ids.ADMIN,
        subjectLogin: null,
        details: '{"reason":"ACCOUNT_NOT_FOUND"}',
      },
    ]);
  });
});

describe('administrator account audit events', () => {
  it('SEC-69 records all eight actions with actor, subject, address and time', async () => {
    const admin = asUser('ADMIN');
    const created = await admin.post(accounts, '/api/admin/users', {
      headers: forwarded,
      json: { login: 'Audit.Target', firstName: 'Initial', lastName: 'Person', role: 'GUEST' },
    });
    expect(created.status).toBe(201);
    const { user: result, temporaryPassword } = await created.json();
    const id: string = result.id;
    const originalHash = user(id)?.passwordHash;
    const path = userPath(id);
    const updated = await admin.patch(account, path, {
      ...target(id),
      json: { firstName: 'Edited', role: 'EMPLOYEE' },
    });
    expect(updated.status).toBe(200);
    for (const [handler, suffix] of [
      [block, '/block'],
      [unblock, '/unblock'],
      [unlock, '/unlock'],
    ] as const) {
      expect((await admin.post(handler, path + suffix, target(id))).status).toBe(200);
    }
    expect(
      (await admin.post(resetTotp, path + '/reset-totp', { ...target(id), json: {} })).status,
    ).toBe(204);
    expect((await admin.delete(account, path, target(id))).status).toBe(204);

    const rows = auditRows();
    expect(rows.map((row) => [row.action, details(row)])).toEqual([
      ['USER_CREATED', { userId: id }],
      ['USER_UPDATED', { changedFields: ['firstName'] }],
      ['USER_ROLE_CHANGED', { from: 'guest', to: 'employee' }],
      ['USER_BLOCKED', {}],
      ['USER_UNBLOCKED', {}],
      ['USER_UNLOCKED', {}],
      ['USER_TOTP_RESET', {}],
      ['USER_DELETED', {}],
    ]);
    expect(rows[1]?.requestId).toBe(rows[2]?.requestId);
    for (const row of rows) {
      expect(row).toMatchObject({
        actorUserId: ids.ADMIN,
        actorLogin: 'ADMIN',
        subjectLogin: 'audit.target',
        actorType: 'USER',
        outcome: 'SUCCESS',
        ip: IP,
        occurredAt: NOW.toISOString(),
      });
    }
    expect(JSON.stringify(rows)).not.toContain(temporaryPassword.value);
    expect(JSON.stringify(rows)).not.toContain(originalHash);
  });

  it('records both protected-account refusals without modifying ADMIN', async () => {
    const id = ids.ADMIN!;
    const before = user(id);
    const admin = asUser('ADMIN');
    expect((await admin.post(block, userPath(id, '/block'), target(id))).status).toBe(409);
    expect((await admin.delete(account, userPath(id), target(id))).status).toBe(409);

    expect(user(id)).toEqual(before);
    expect(auditRows()).toMatchObject([
      {
        action: 'USER_BLOCKED',
        outcome: 'FAILURE',
        subjectLogin: 'admin',
        details: '{"reason":"PROTECTED_ACCOUNT"}',
      },
      {
        action: 'USER_DELETED',
        outcome: 'FAILURE',
        subjectLogin: 'admin',
        details: '{"reason":"PROTECTED_ACCOUNT"}',
      },
    ]);
  });

  it('records a timestamp-only account edit with an empty changed-fields list', async () => {
    const id = ids.employee1!;
    const firstName = user(id)?.firstName;
    clock.advance(1);
    const response = await asUser('ADMIN').patch(account, userPath(id), {
      ...target(id),
      json: { firstName },
    });
    expect(response.status).toBe(200);
    expect(user(id)?.updatedAt).toEqual(clock.now());
    expect(auditRows()).toMatchObject([
      {
        action: 'USER_UPDATED',
        outcome: 'SUCCESS',
        details: '{"changedFields":[]}',
      },
    ]);
  });

  it('rolls back the update and its first entry when the role-change audit write fails', async () => {
    const id = ids.employee1!;
    const before = user(id);
    db.$client.exec(
      "CREATE TRIGGER test_role_audit_failure BEFORE INSERT ON audit_log WHEN NEW.action = 'USER_ROLE_CHANGED' BEGIN SELECT RAISE(ABORT, 'synthetic'); END;",
    );
    const response = await asUser('ADMIN').patch(account, userPath(id), {
      ...target(id),
      json: { firstName: 'Changed', role: 'MANAGER' },
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: 'AUDIT_UNAVAILABLE' } });
    expect(user(id)).toEqual(before);
    expect(auditRows()).toEqual([]);
  });
});

describe('settings and access control audit events', () => {
  it('SEC-70 records one settings entry with both before-and-after values and retains the legacy event', async () => {
    const result = await asUser('ADMIN').patch(settings, '/api/admin/security-settings', {
      headers: forwarded,
      json: { minPasswordLength: 16, rejectPersonalDataInPassword: true },
    });
    expect(result.status).toBe(200);
    const rows = auditRows();
    expect(rows).toMatchObject([
      {
        action: 'SETTINGS_CHANGED',
        outcome: 'SUCCESS',
        actorUserId: ids.ADMIN,
        actorLogin: 'ADMIN',
        ip: IP,
        occurredAt: NOW.toISOString(),
      },
    ]);
    expect(details(rows[0]!)).toEqual({
      changes: [
        { key: 'minPasswordLength', from: 12, to: 16 },
        { key: 'rejectPersonalDataInPassword', from: false, to: true },
      ],
    });
    expect(db.select().from(securityEvents).all()).toMatchObject([
      {
        type: 'SECURITY_SETTINGS_CHANGED',
        userId: ids.ADMIN,
        requestId: rows[0]?.requestId,
      },
    ]);
  });

  it('rolls back the settings change when its audit insert fails', async () => {
    rejectAuditInserts(db);
    const rejected = await asUser('ADMIN').patch(settings, '/api/admin/security-settings', {
      headers: forwarded,
      json: { sessionIdleTimeoutMinutes: 20 },
    });
    expect(rejected.status).toBe(500);
    expect(await rejected.json()).toMatchObject({ error: { code: 'AUDIT_UNAVAILABLE' } });
    expect(db.select().from(securitySettings).all()).toEqual([]);
    expect(db.select().from(securityEvents).all()).toEqual([]);
    expect(auditRows()).toEqual([]);
  });

  it('SEC-71 records permission, CSRF and stage refusals with the right actors and excludes anonymous 401s', async () => {
    const usersUrl = '/api/admin/users';
    expect((await createApiClient().get(accounts, usersUrl)).status).toBe(401);
    expect(auditRows()).toEqual([]);
    expect((await asUser('guest1').get(accounts, usersUrl, { headers: forwarded })).status).toBe(
      403,
    );
    expect(
      (
        await asUser('ADMIN').patch(settings, '/api/admin/security-settings', {
          headers: { ...forwarded, origin: 'https://other.example' },
          json: { sessionIdleTimeoutMinutes: 20 },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await asUser('employee1', 'INITIAL_PASSWORD_CHANGE').get(accounts, usersUrl, {
          headers: forwarded,
        })
      ).status,
    ).toBe(403);
    expect(
      (await asUser('employee1', 'TOTP_CHALLENGE').get(accounts, usersUrl, { headers: forwarded }))
        .status,
    ).toBe(403);

    const rows = auditRows();
    expect(rows.map((row) => [row.actorUserId, row.actorLogin, details(row)])).toEqual([
      [ids.guest1, 'guest1', { reason: 'PERMISSION', route: 'admin.users.list' }],
      [ids.ADMIN, 'ADMIN', { reason: 'CSRF', route: 'admin.security_settings.update' }],
      [ids.employee1, 'employee1', { reason: 'STAGE', route: 'admin.users.list' }],
      [ids.employee1, 'employee1', { reason: 'TOTP_REQUIRED', route: 'admin.users.list' }],
    ]);
    for (const row of rows) {
      expect(row).toMatchObject({
        action: 'ACCESS_DENIED',
        outcome: 'FAILURE',
        actorType: 'USER',
        ip: IP,
      });
    }
  });

  it('records only the resource kind and keeps an unreadable ticket indistinguishable from a missing ticket', async () => {
    const stored = db
      .insert(tickets)
      .values({
        title: 'Private ticket title',
        description: 'Private ticket body',
        createdByUserId: ids.guest1!,
      })
      .returning({ id: tickets.id })
      .get();
    const missingId = '00000000-0000-4000-8000-0000000000ff';
    const client = asUser('guest2');
    const denied = await client.get(ticket, '/api/tickets/' + stored.id, target(stored.id));
    const missing = await client.get(ticket, '/api/tickets/' + missingId, target(missingId));

    expect([denied.status, missing.status]).toEqual([404, 404]);
    expect(await denied.text()).toBe(await missing.text());
    const rows = auditRows();
    expect(rows).toMatchObject([
      {
        action: 'OBJECT_ACCESS_DENIED',
        outcome: 'FAILURE',
        actorLogin: 'guest2',
        details: '{"reason":"PERMISSION","resource":"TICKET"}',
        ip: IP,
        subjectLogin: null,
        subjectRef: null,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain(stored.id);
    expect(JSON.stringify(rows)).not.toContain('Private ticket');
  });
});

describe('TOTP and decoy audit events', () => {
  it('records enrollment, challenge success and refusals, and disabling without secrets or codes', async () => {
    const client = asUser('employee1');
    const postOptions = { headers: forwarded };
    const pending = await client.post(enrollTotp, '/api/auth/totp/enroll', {
      ...postOptions,
      json: {},
    });
    expect(pending.status).toBe(200);
    const { otpauthUri } = await pending.json();
    const secret = new URL(otpauthUri).searchParams.get('secret')!;
    const codeFor = (offset = 0) =>
      generate({
        secret,
        epoch: Math.floor(clock.now().getTime() / 1000) + offset,
      });
    let enrollCode = await codeFor();
    while (enrollCode === (await codeFor(30))) {
      clock.advance(30_000);
      enrollCode = await codeFor();
    }
    expect(
      (
        await client.post(verifyEnrollment, '/api/auth/totp/verify-enrollment', {
          ...postOptions,
          json: { code: enrollCode },
        })
      ).status,
    ).toBe(204);

    const currentCodes = await Promise.all([-30, 0, 30].map(codeFor));
    const wrong = ['123456', '234567', '345678', '456789'].find(
      (code) => !currentCodes.includes(code),
    )!;
    const restricted = asUser('employee1', 'TOTP_CHALLENGE');
    const challenge = (code: string) =>
      restricted.post(challengeTotp, '/api/auth/totp/challenge', {
        ...postOptions,
        json: { code },
      });
    expect((await challenge(wrong)).status).toBe(400);
    expect((await challenge(enrollCode)).status).toBe(400);
    // Choose a later step that does not collide with the digits of the enrollment code.
    clock.advance(30_000);
    let accepted = await codeFor();
    while (accepted === enrollCode) {
      clock.advance(30_000);
      accepted = await codeFor();
    }
    expect((await challenge(accepted)).status).toBe(200);

    clock.advance(30_000);
    let disableCode = await codeFor();
    while (disableCode === accepted) {
      clock.advance(30_000);
      disableCode = await codeFor();
    }
    expect(
      (
        await client.post(disableTotp, '/api/auth/totp/disable', {
          ...postOptions,
          json: { currentPassword: PASSWORD, code: disableCode },
        })
      ).status,
    ).toBe(204);

    const rows = auditRows();
    expect(rows.map((row) => [row.action, row.outcome, details(row)])).toEqual([
      ['TOTP_ENROLLED', 'SUCCESS', {}],
      ['AUTH_TOTP_CHALLENGE', 'FAILURE', { reason: 'INVALID_CODE' }],
      ['AUTH_TOTP_CHALLENGE', 'FAILURE', { reason: 'REPLAYED_CODE' }],
      ['AUTH_TOTP_CHALLENGE', 'SUCCESS', {}],
      ['TOTP_DISABLED', 'SUCCESS', {}],
    ]);
    for (const row of rows) expect(row).toMatchObject({ ip: IP, actorUserId: ids.employee1 });
    const storedText = JSON.stringify(
      rows.map(({ description, details }) => ({ description, details })),
    );
    for (const privateValue of [secret, enrollCode, wrong, accepted, disableCode, PASSWORD]) {
      expect(storedText).not.toContain(privateValue);
    }
  });

  it('records decoy accesses alongside the aggregated Module 2 signal', async () => {
    db.transaction(seedHoneytokens);
    vi.stubEnv('CANARY_ALERTS_ENABLED', 'false');
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.stubEnv('CANARY_DECOY_AWS_ACCESS_KEY_ID', 'synthetic-decoy-access-value');
    vi.stubEnv('CANARY_DECOY_AWS_SECRET_ACCESS_KEY', 'synthetic-decoy-private-value');
    try {
      const client = createApiClient();
      for (let i = 0; i < 2; i++) {
        expect((await client.get(decoy, '/api/backup/config', { headers: forwarded })).status).toBe(
          200,
        );
      }

      const rows = auditRows();
      expect(rows).toHaveLength(2);
      for (const row of rows)
        expect(row).toMatchObject({
          action: 'DECOY_RESOURCE_ACCESSED',
          actorType: 'ANONYMOUS',
          ip: IP,
          details: '{"resource":"/api/backup/config"}',
        });
      expect(JSON.stringify(rows)).not.toContain('synthetic-decoy-');
      const signals = db.select().from(securityEvents).all();
      expect(signals).toMatchObject([{ type: 'DECOY_RESOURCE_ACCESSED' }]);
      expect(details(signals[0]!)).toMatchObject({ count: 2 });
    } finally {
      await flushPendingAlerts();
    }
  });
});
