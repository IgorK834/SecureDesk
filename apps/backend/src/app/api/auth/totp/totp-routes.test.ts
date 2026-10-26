import { eq } from 'drizzle-orm';
import { generate } from 'otplib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../../../../server/auth/cookie';
import { hashPassword } from '../../../../server/auth/password-hasher';
import { createSession } from '../../../../server/auth/session-service';
import { resetTotpRateLimiterForTests } from '../../../../server/auth/totp-service';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import { users } from '../../../../server/db/schema';
import { seedRbac } from '../../../../server/db/seeds/rbac';
import { csrfTokenForSession } from '../../../../server/security/csrf';
import { ROLES } from '../../../../server/permissions/codes';
import * as resetTotpRoute from '../../admin/users/[id]/reset-totp/route';
import * as usersRoute from '../../admin/users/route';
import * as challengeRoute from './challenge/route';
import * as disableRoute from './disable/route';
import * as enrollRoute from './enroll/route';
import * as confirmRoute from './verify-enrollment/route';

const NOW = new Date('2030-01-01T00:00:05.000Z');
const fakeClock = new FakeClock(NOW);
setUpSharedTestDb();

beforeEach(() => {
  fakeClock.set(NOW);
  fakeClock.install();
  resetTotpRateLimiterForTests();
  db.transaction((tx) => seedRbac(tx));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  resetTotpRateLimiterForTests();
  vi.restoreAllMocks();
});

const sessionFor = (userId: string, stage: 'FULLY_AUTHENTICATED' | 'TOTP_CHALLENGE') => {
  const created = createSession(db, userId, stage);
  return { token: created.token, csrfToken: csrfTokenForSession(created.session.id) };
};

const secretFrom = (uri: string) => new URL(uri).searchParams.get('secret') as string;
const codeFor = (secret: string) =>
  generate({ secret, epoch: Math.floor(fakeClock.now().getTime() / 1000) });

describe('TOTP API enrollment, challenge and disable', () => {
  it('enables TOTP and makes the next password-authenticated session complete a second factor', async () => {
    const userId = insertUser(db, { login: 'employee1' });
    const client = createApiClient().signIn(sessionFor(userId, 'FULLY_AUTHENTICATED'));

    const enrollment = await client.post(enrollRoute, '/api/auth/totp/enroll', { json: {} });
    expect(enrollment.status).toBe(200);
    const { otpauthUri } = (await enrollment.json()) as { otpauthUri: string };
    const secret = secretFrom(otpauthUri);
    const confirm = await client.post(confirmRoute, '/api/auth/totp/verify-enrollment', {
      json: { code: await codeFor(secret) },
    });
    expect(confirm.status).toBe(204);

    fakeClock.advance(30_000);
    const restricted = createApiClient().signIn(sessionFor(userId, 'TOTP_CHALLENGE'));
    const protectedResponse = await restricted.get(usersRoute, '/api/admin/users');
    expect(protectedResponse.status).toBe(403);
    expect(await protectedResponse.json()).toMatchObject({ error: { code: 'AUTH_TOTP_REQUIRED' } });

    const challenge = await restricted.post(challengeRoute, '/api/auth/totp/challenge', {
      json: { code: await codeFor(secret) },
    });
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toMatchObject({ authStage: 'FULLY_AUTHENTICATED' });
    expect(restricted.cookie(sessionCookieName())).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('refuses a wrong code and does not echo the secret after enrollment', async () => {
    const userId = insertUser(db, { login: 'employee1' });
    const client = createApiClient().signIn(sessionFor(userId, 'FULLY_AUTHENTICATED'));
    const response = await client.post(enrollRoute, '/api/auth/totp/enroll', { json: {} });
    const body = (await response.json()) as { otpauthUri: string };
    const secret = secretFrom(body.otpauthUri);

    const wrong = await client.post(confirmRoute, '/api/auth/totp/verify-enrollment', {
      json: { code: '000000' },
    });
    expect(wrong.status).toBe(400);
    expect(await wrong.text()).not.toContain(secret);
    expect(JSON.stringify(db.select().from(users).where(eq(users.id, userId)).get())).not.toContain(
      secret,
    );
  });

  it('requires both the current password and a fresh code to disable TOTP', async () => {
    const password = 'A compliant password 123!';
    const userId = insertUser(db, {
      login: 'employee1',
      passwordHash: await hashPassword(password),
    });
    const client = createApiClient().signIn(sessionFor(userId, 'FULLY_AUTHENTICATED'));
    const enrollment = await client.post(enrollRoute, '/api/auth/totp/enroll', { json: {} });
    const secret = secretFrom(((await enrollment.json()) as { otpauthUri: string }).otpauthUri);
    await client.post(confirmRoute, '/api/auth/totp/verify-enrollment', {
      json: { code: await codeFor(secret) },
    });
    fakeClock.advance(30_000);

    const wrong = await client.post(disableRoute, '/api/auth/totp/disable', {
      json: { currentPassword: 'wrong password', code: await codeFor(secret) },
    });
    expect(wrong.status).toBe(400);
    expect(db.select().from(users).where(eq(users.id, userId)).get()?.totpEnabledAt).not.toBeNull();

    const disabled = await client.post(disableRoute, '/api/auth/totp/disable', {
      json: { currentPassword: password, code: await codeFor(secret) },
    });
    expect(disabled.status).toBe(204);
    expect(db.select().from(users).where(eq(users.id, userId)).get()?.totpEnabledAt).toBeNull();
  });
});

describe('administrator TOTP recovery', () => {
  it('clears the encrypted secret and revokes the target session', async () => {
    const adminId = insertUser(db, { login: 'ADMIN', roleId: ROLES.ADMINISTRATOR });
    const targetId = insertUser(db, { login: 'employee1' });
    const target = createApiClient().signIn(sessionFor(targetId, 'FULLY_AUTHENTICATED'));
    const enrollment = await target.post(enrollRoute, '/api/auth/totp/enroll', { json: {} });
    const secret = secretFrom(((await enrollment.json()) as { otpauthUri: string }).otpauthUri);
    await target.post(confirmRoute, '/api/auth/totp/verify-enrollment', {
      json: { code: await codeFor(secret) },
    });

    const admin = createApiClient().signIn(sessionFor(adminId, 'FULLY_AUTHENTICATED'));
    const response = await admin.post(resetTotpRoute, `/api/admin/users/${targetId}/reset-totp`, {
      params: { id: targetId },
      json: {},
    });

    expect(response.status).toBe(204);
    expect(db.select().from(users).where(eq(users.id, targetId)).get()).toMatchObject({
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
    });
    expect((await target.get(usersRoute, '/api/admin/users')).status).toBe(401);
  });
});
