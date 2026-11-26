import path from 'node:path';
import { desc, eq, gt } from 'drizzle-orm';
import { generate, generateSecret } from 'otplib';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditAction } from '../apps/backend/src/server/audit/events';
import { hashPassword } from '../apps/backend/src/server/auth/password-hasher';
import { encryptTotpSecret } from '../apps/backend/src/server/auth/totp-service';
import { seedWorld, signInAs } from '../apps/backend/src/server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../apps/backend/src/server/db/__fixtures__/shared-test-db';
import { db } from '../apps/backend/src/server/db/client';
import {
  auditLog,
  securityEvents,
  tickets,
  users,
  type AuthStage,
} from '../apps/backend/src/server/db/schema';
import { ACCOUNT_TRAP_ID, seedHoneytokens } from '../apps/backend/src/server/db/seeds/honeytokens';
import { getRouteMeta, type DefinedRoute } from '../apps/backend/src/server/http/route-handler';
import { clearAlertDispatchers } from '../apps/backend/src/server/security/alerts';
import { issueInternalChallenge } from '../apps/backend/src/server/security/captcha/internal';
import { flushPendingAlerts } from '../apps/backend/src/server/security/events';
import {
  createApiClient,
  type ApiClient,
  type CallOptions,
  type HttpMethod,
} from './helpers/api-client';
import { FakeClock } from './helpers/fake-clock';
import { loadRoutes } from './helpers/route-scanner';

const API_ROOT = path.resolve(__dirname, '../apps/backend/src/app/api');
const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const routes = (await loadRoutes(API_ROOT)).filter(({ method }) => MUTATING.has(method));

const NOW = new Date('2026-11-26T09:15:00.000Z');
const clock = new FakeClock(NOW);
const PASSWORD = 'A synthetic credential for coverage tests';
const NEW_PASSWORD = 'A different synthetic replacement credential';
let passwordHash: string;
let ids: Record<string, string>;

interface Sample {
  client: ApiClient;
  options?: CallOptions;
}

type CoverageDecision = {
  sample: () => Sample | Promise<Sample>;
} & (
  | { actions: readonly [AuditAction, ...AuditAction[]]; exemption?: never }
  | { exemption: string; actions?: never }
);

const clientFor = (login: string, stage?: AuthStage) =>
  createApiClient().signIn(signInAs(db, ids[login]!, stage));
const admin = (options?: CallOptions): Sample => ({ client: clientFor('ADMIN'), options });
const employee = (options?: CallOptions, stage?: AuthStage): Sample => ({
  client: clientFor('employee1', stage),
  options,
});
const userTarget = () => ({ id: ids.employee2! });

function captcha(purpose: 'login' | 'change-password') {
  const challenge = issueInternalChallenge(db, { purpose, ipKey: 'unknown', now: NOW });
  return { challengeId: challenge.publicChallenge.challengeId, answer: challenge.expectedAnswer };
}

async function totpCode(enabled: boolean) {
  const secret = generateSecret();
  db.update(users)
    .set({
      totpSecretEncrypted: encryptTotpSecret(secret),
      totpEnabledAt: enabled ? NOW : null,
    })
    .where(eq(users.id, ids.employee1!))
    .run();
  return generate({ secret, epoch: Math.floor(NOW.getTime() / 1000) });
}

function sampleTicket() {
  return db
    .insert(tickets)
    .values({
      title: 'A support ticket',
      description: 'A synthetic fixture',
      createdByUserId: ids.guest1!,
    })
    .returning({ id: tickets.id })
    .get();
}

const AUDIT_COVERAGE: Readonly<Record<string, CoverageDecision>> = {
  'admin.audit_log.export': {
    actions: ['AUDIT_LOG_EXPORTED'],
    sample: () => admin({ json: { format: 'jsonl' } }),
  },
  'admin.security_settings.update': {
    actions: ['SETTINGS_CHANGED'],
    sample: () => admin({ json: { sessionIdleTimeoutMinutes: 20 } }),
  },
  'admin.users.create': {
    actions: ['USER_CREATED'],
    sample: () =>
      admin({ json: { login: 'new.user', firstName: 'New', lastName: 'User', role: 'GUEST' } }),
  },
  'admin.users.update': {
    actions: ['USER_UPDATED', 'USER_ROLE_CHANGED'],
    sample: () => admin({ params: userTarget(), json: { firstName: 'Changed', role: 'MANAGER' } }),
  },
  'admin.users.block': {
    actions: ['USER_BLOCKED'],
    sample: () => admin({ params: userTarget() }),
  },
  'admin.users.unblock': {
    actions: ['USER_UNBLOCKED'],
    sample: () => {
      db.update(users).set({ isBlocked: true }).where(eq(users.id, ids.employee2!)).run();
      return admin({ params: userTarget() });
    },
  },
  'admin.users.delete': {
    actions: ['USER_DELETED'],
    sample: () => admin({ params: userTarget() }),
  },
  'admin.users.unlock': {
    actions: ['USER_UNLOCKED'],
    sample: () => admin({ params: userTarget() }),
  },
  'admin.users.reset_password': {
    actions: ['PASSWORD_RESET_BY_ADMIN'],
    sample: () => admin({ params: userTarget(), json: {} }),
  },
  'admin.users.reset_totp': {
    actions: ['USER_TOTP_RESET'],
    sample: async () => {
      await totpCode(true);
      return admin({ params: { id: ids.employee1! }, json: {} });
    },
  },
  'auth.login': {
    actions: ['AUTH_LOGIN_SUCCESS'],
    sample: () => ({
      client: createApiClient(),
      options: { json: { login: 'employee1', password: PASSWORD, captcha: captcha('login') } },
    }),
  },
  'auth.logout': {
    actions: ['AUTH_LOGOUT'],
    sample: () => employee(),
  },
  'auth.change_initial_password': {
    actions: ['PASSWORD_CHANGED'],
    sample: () => {
      db.update(users).set({ mustChangePassword: true }).where(eq(users.id, ids.employee1!)).run();
      return employee(
        {
          json: {
            newPassword: NEW_PASSWORD,
            confirmNewPassword: NEW_PASSWORD,
            captcha: captcha('change-password'),
          },
        },
        'INITIAL_PASSWORD_CHANGE',
      );
    },
  },
  'auth.change_password': {
    actions: ['PASSWORD_CHANGED'],
    sample: () =>
      employee({
        json: {
          currentPassword: PASSWORD,
          newPassword: NEW_PASSWORD,
          confirmNewPassword: NEW_PASSWORD,
          captcha: captcha('change-password'),
        },
      }),
  },
  'auth.totp.verify_enrollment': {
    actions: ['TOTP_ENROLLED'],
    sample: async () => employee({ json: { code: await totpCode(false) } }),
  },
  'auth.totp.disable': {
    actions: ['TOTP_DISABLED'],
    sample: async () =>
      employee({ json: { currentPassword: PASSWORD, code: await totpCode(true) } }),
  },
  'auth.totp.challenge': {
    actions: ['AUTH_TOTP_CHALLENGE'],
    sample: async () => employee({ json: { code: await totpCode(true) } }, 'TOTP_CHALLENGE'),
  },
  'auth.totp.enroll': {
    exemption:
      'Prepares a pending factor. The audit entry belongs to verification, which enables the factor.',
    sample: () => employee({ json: {} }),
  },
  'captcha.challenge': {
    exemption:
      'Creates a short-lived abuse prevention challenge. Auditing public issuance would let callers flood the trail.',
    sample: () => ({ client: createApiClient(), options: { json: { purpose: 'login' } } }),
  },
  'admin.ip_blocks.clear': {
    exemption:
      'Clears a transient per-address throttle. Module 2 records who cleared which address in IP_BLOCK_CLEARED_BY_ADMIN.',
    sample: () => admin({ params: { ipKey: '192.0.2.14' } }),
  },
  'admin.security_events.acknowledge': {
    exemption:
      'Triage metadata belongs to the Module 2 event itself, which stores the acknowledgement time and operator.',
    sample: () => {
      const event = db
        .insert(securityEvents)
        .values({
          type: 'ACCOUNT_LOCKED',
          severity: 'WARNING',
          details: '{}',
          requestId: 'fixture-acknowledge',
        })
        .returning({ id: securityEvents.id })
        .get();
      return admin({ params: event });
    },
  },
  'admin.honeytokens.test': {
    exemption:
      'Sends a synthetic test alert and records HONEYTOKEN_TESTED in Module 2 without changing the trap.',
    sample: () => admin({ params: { id: ACCOUNT_TRAP_ID } }),
  },
  'tickets.create': {
    exemption:
      'Creates support content. The ticket row already stores its author and creation time.',
    sample: () => ({
      client: clientFor('guest1'),
      options: { json: { title: 'Example', description: 'Fixture' } },
    }),
  },
  'tickets.assign': {
    exemption:
      'Assigns work within the ticket policy. Denials of access to a ticket are audited separately.',
    sample: () => ({
      client: clientFor('manager1'),
      options: {
        params: sampleTicket(),
        json: { assignedToUserId: ids.employee1! },
      },
    }),
  },
  'tickets.update_status': {
    exemption:
      'Changes support workflow state. Denials of access to a ticket are audited separately.',
    sample: () => ({
      client: clientFor('manager1'),
      options: {
        params: sampleTicket(),
        json: { status: 'RESOLVED' },
      },
    }),
  },
};

describe('audit coverage registry', () => {
  it('registers every mutating route exactly once', () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const { handler, method, route } of routes) {
      const name = getRouteMeta(handler)?.name;
      if (!name || !Object.hasOwn(AUDIT_COVERAGE, name)) {
        problems.push(
          method +
            ' ' +
            route +
            ' has no audit coverage decision' +
            (name ? ' (' + name + ')' : ''),
        );
        continue;
      }
      if (seen.has(name)) problems.push('Duplicate mutating route name: ' + name);
      seen.add(name);
    }
    for (const name of Object.keys(AUDIT_COVERAGE)) {
      if (!seen.has(name)) problems.push('Stale audit coverage decision: ' + name);
    }
    expect(problems).toEqual([]);
  });
});

describe('mutating route audit coverage', () => {
  setUpSharedTestDb();

  beforeAll(async () => {
    passwordHash = await hashPassword(PASSWORD);
  });
  beforeEach(() => {
    clock.set(NOW);
    clock.install();
    ids = seedWorld(db);
    db.transaction(seedHoneytokens);
    db.update(users).set({ passwordHash }).where(eq(users.id, ids.employee1!)).run();
    vi.stubEnv('TRUST_PROXY', 'false');
    vi.stubEnv('CAPTCHA_LOGIN_PROVIDER', 'internal');
    vi.stubEnv('CAPTCHA_PASSWORD_CHANGE_PROVIDER', 'internal');
    vi.stubEnv('CAPTCHA_HMAC_SECRET', 'synthetic-coverage-test-secret');
    vi.stubEnv('CANARY_ALERTS_ENABLED', 'false');
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clearAlertDispatchers();
    clock.uninstall();
    vi.restoreAllMocks();
  });

  it.each(Object.entries(AUDIT_COVERAGE))(
    '%s follows its audit coverage decision',
    async (name, decision) => {
      const entry = routes.find(({ handler }) => getRouteMeta(handler)?.name === name);
      expect(entry, 'missing handler for ' + name).toBeDefined();
      const { handler, method, route } = entry!;
      const { client, options } = await decision.sample();
      const url = route.replace(/\[(\w+)\]/g, (_, parameter: string) => {
        const value = options?.params?.[parameter];
        if (value === undefined) throw new Error('Missing sample path parameter: ' + parameter);
        return encodeURIComponent(value);
      });
      const before =
        db.select({ seq: auditLog.seq }).from(auditLog).orderBy(desc(auditLog.seq)).limit(1).get()
          ?.seq ?? 0;
      try {
        const response = await client.request(
          { [method]: handler as DefinedRoute },
          method as HttpMethod,
          url,
          options,
        );
        expect(response.ok, 'sample returned HTTP ' + response.status).toBe(true);
        await response.arrayBuffer();
        const appended = db.select().from(auditLog).where(gt(auditLog.seq, before)).all();
        if (decision.actions) {
          expect(appended.map(({ action }) => action)).toEqual(
            expect.arrayContaining(decision.actions),
          );
        } else {
          expect(decision.exemption.trim()).not.toBe('');
          expect(appended).toEqual([]);
        }
      } finally {
        await flushPendingAlerts();
      }
    },
  );
});
