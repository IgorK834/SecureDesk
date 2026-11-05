import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import {
  SECURITY_EVENT_SEVERITIES,
  honeytokens,
  securityEvents,
  securitySettings,
} from '../db/schema';
import { SecuritySettingsPatch } from './schemas';
import {
  type AlertDispatcher,
  type SecurityEventRecord,
  clearAlertDispatchers,
  registerAlertDispatcher,
} from './alerts';
import {
  AGGREGATION_BUCKET_MS,
  MAX_USER_AGENT_LENGTH,
  SECURITY_EVENTS,
  type SecurityEventType,
  flushPendingAlerts,
  recordAggregated,
  recordSecurityEvent,
} from './events';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);

let db: AppDb;
beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db = createMigratedDb();
  clearAlertDispatchers();
});
afterEach(() => {
  vi.unstubAllEnvs(); // before the clock: it refuses to be uninstalled in production
  fakeClock.uninstall();
  clearAlertDispatchers();
  vi.useRealTimers();
  db.$client.close();
});

const rows = () => db.select().from(securityEvents).all();
const row = (id: string) => db.select().from(securityEvents).where(eq(securityEvents.id, id)).get();

const locked = {
  type: 'ACCOUNT_LOCKED' as const,
  requestId: 'req-1',
  details: { attempts: 5, lockedUntil: '2030-01-01T00:15:00.000Z' },
};
const decoy = {
  type: 'DECOY_RESOURCE_ACCESSED' as const,
  requestId: 'req-2',
  ipKey: '203.0.113.5',
  details: { count: 1, resource: '/api/backup/config' },
};
const captchaFailed = {
  type: 'CAPTCHA_FAILED' as const,
  requestId: 'req-3',
  ipKey: '203.0.113.5',
  details: { form: 'login' as const },
};

const ALL_TYPES = [
  'ACCOUNT_LOCKED',
  'LOGIN_IP_BLOCKED',
  'CAPTCHA_FAILED',
  'CAPTCHA_PROVIDER_ERROR',
  'HONEYPOT_TRIGGERED',
  'HONEYTOKEN_TRIGGERED',
  'HONEYTOKEN_TESTED',
  'DECOY_RESOURCE_ACCESSED',
  'PASSWORD_SPRAYING_SUSPECTED',
  'CHANGE_PASSWORD_BRUTE_FORCE',
  'ACCOUNT_UNLOCKED_BY_ADMIN',
  'IP_BLOCK_CLEARED_BY_ADMIN',
  'SECURITY_SETTINGS_CHANGED',
];

describe('the event registry', () => {
  it('has exactly the types of backlog section 6.6', () => {
    expect(Object.keys(SECURITY_EVENTS).sort()).toStrictEqual([...ALL_TYPES].sort());
  });

  it.each(ALL_TYPES)('%s has a severity and a strict details schema', (type) => {
    const definition = SECURITY_EVENTS[type as SecurityEventType];

    expect(SECURITY_EVENT_SEVERITIES).toContain(definition.severity);
    expect(typeof definition.details.safeParse).toBe('function');
    // Strict: a key the schema does not declare is refused, whatever its name.
    const probe = definition.details.safeParse({ undeclaredKey: 1 });
    expect(probe.success).toBe(false);
  });

  it('makes real honeytoken hits CRITICAL and the marked test event alerting', () => {
    const critical = Object.entries(SECURITY_EVENTS)
      .filter(([, definition]) => definition.severity === 'CRITICAL')
      .map(([type]) => type);
    const alerting = Object.entries(SECURITY_EVENTS)
      .filter(([, definition]) => 'alert' in definition)
      .map(([type]) => type);

    expect(critical.sort()).toStrictEqual(['DECOY_RESOURCE_ACCESSED', 'HONEYTOKEN_TRIGGERED']);
    expect(alerting.sort()).toStrictEqual([
      'DECOY_RESOURCE_ACCESSED',
      'HONEYTOKEN_TESTED',
      'HONEYTOKEN_TRIGGERED',
    ]);
  });

  it('aggregates the noisy types', () => {
    const aggregated = Object.entries(SECURITY_EVENTS)
      .filter(([, definition]) => 'aggregated' in definition)
      .map(([type]) => type);

    expect(aggregated.sort()).toStrictEqual([
      'CAPTCHA_FAILED',
      'DECOY_RESOURCE_ACCESSED',
      'HONEYPOT_TRIGGERED',
      'LOGIN_IP_BLOCKED',
    ]);
  });

  it('names every security setting of the patch schema, and no other, in SECURITY_SETTINGS_CHANGED', () => {
    const keys =
      SECURITY_EVENTS.SECURITY_SETTINGS_CHANGED.details.shape.changedKeys.element.options;

    expect([...keys].sort()).toStrictEqual(Object.keys(SecuritySettingsPatch.shape).sort());
  });

  it('declares no details key that its own redaction guard would refuse', () => {
    for (const definition of Object.values(SECURITY_EVENTS)) {
      const keys = Object.keys((definition.details as { shape: object }).shape);
      expect(keys.filter((key) => /password|token|secret|answer|captcha/i.test(key))).toStrictEqual(
        [],
      );
    }
  });
});

describe('recordSecurityEvent', () => {
  it('stores the event with the registry severity and returns its id', () => {
    const id = recordSecurityEvent(db, {
      ...locked,
      ipKey: '203.0.113.5',
      loginNormalized: 'admin',
      userAgent: 'Mozilla/5.0',
    });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row(id as string)).toStrictEqual({
      id,
      type: 'ACCOUNT_LOCKED',
      severity: 'WARNING',
      occurredAt: T0,
      ipKey: '203.0.113.5',
      userAgent: 'Mozilla/5.0',
      loginNormalized: 'admin',
      userId: null,
      honeytokenId: null,
      details: JSON.stringify(locked.details),
      requestId: 'req-1',
      acknowledgedAt: null,
      acknowledgedBy: null,
      alertStatus: 'NONE',
      alertAttemptedAt: null,
    });
  });

  it('is synchronous: the row exists when the call returns', () => {
    const id = recordSecurityEvent(db, locked);

    expect(rows().map((r) => r.id)).toStrictEqual([id]);
  });

  it('links the event to a user and a honeytoken', () => {
    const userId = insertUser(db, { login: 'ADMIN' });
    db.insert(honeytokens).values({ id: 'trap', kind: 'ACCOUNT_TRAP', label: 'Trap' }).run();

    const id = recordSecurityEvent(db, {
      type: 'HONEYTOKEN_TRIGGERED',
      requestId: 'r',
      userId,
      honeytokenId: 'trap',
      details: { trapKind: 'ACCOUNT_TRAP' },
    });

    expect(row(id as string)).toMatchObject({ userId, honeytokenId: 'trap' });
  });

  it('cuts the user agent to 200 characters and keeps a shorter one whole', () => {
    const long = recordSecurityEvent(db, { ...locked, userAgent: 'x'.repeat(5000) });
    const exact = recordSecurityEvent(db, { ...locked, userAgent: 'y'.repeat(200) });
    const none = recordSecurityEvent(db, { ...locked, userAgent: '' });

    expect(row(long as string)?.userAgent).toHaveLength(MAX_USER_AGENT_LENGTH);
    expect(row(exact as string)?.userAgent).toBe('y'.repeat(200));
    expect(row(none as string)?.userAgent).toBeNull();
  });

  describe('refuses an event that does not match the registry', () => {
    it('rejects an undeclared details key', () => {
      expect(() =>
        recordSecurityEvent(db, {
          ...locked,
          details: { ...locked.details, ipOfTheAttackersMother: 'x' } as never,
        }),
      ).toThrow(/do not match the declared schema/);
      expect(rows()).toHaveLength(0);
    });

    it.each([
      'password',
      'newPassword',
      'sessionToken',
      'api_secret',
      'answer',
      'captchaResponse',
      'CAPTCHA',
      'Password',
    ])('rejects a details key that looks like a secret: %s', (key) => {
      expect(() =>
        recordSecurityEvent(db, { ...locked, details: { ...locked.details, [key]: 'x' } as never }),
      ).toThrow(/looks like a secret/);
      expect(rows()).toHaveLength(0);
    });

    it('rejects a secret-looking key nested inside the details, and never repeats its value', () => {
      const attempt = () =>
        recordSecurityEvent(db, {
          ...locked,
          details: { ...locked.details, extra: { deep: [{ token: 'hunter2' }] } } as never,
        });

      expect(attempt).toThrow(/looks like a secret/);
      expect(attempt).not.toThrow(/hunter2/);
    });

    it('rejects a value of the wrong shape', () => {
      expect(() =>
        recordSecurityEvent(db, { ...locked, details: { attempts: 0, lockedUntil: 'tomorrow' } }),
      ).toThrow(/declared schema/);
      expect(() => recordSecurityEvent(db, { ...locked, details: {} as never })).toThrow();
    });

    it('rejects a type that is not in the registry', () => {
      expect(() =>
        recordSecurityEvent(db, { type: 'MADE_UP', requestId: 'r', details: {} } as never),
      ).toThrow(/unknown event type/);
    });

    it('drops the event instead of throwing in production, so a request never fails over it', () => {
      vi.stubEnv('NODE_ENV', 'production');

      const bad = recordSecurityEvent(db, {
        ...locked,
        details: { ...locked.details, password: 'x' } as never,
      });
      const unknown = recordSecurityEvent(db, {
        type: 'MADE_UP',
        requestId: 'r',
        details: {},
      } as never);
      const good = recordSecurityEvent(db, locked);

      expect(bad).toBeUndefined();
      expect(unknown).toBeUndefined();
      expect(rows().map((r) => r.id)).toStrictEqual([good]);
    });
  });
});

describe('recordAggregated', () => {
  it('SEC-54-independent: 1000 identical CAPTCHA_FAILED events from one address in one bucket are one row with count 1000', () => {
    const ids = new Set<string | undefined>();
    for (let i = 0; i < 1000; i++) ids.add(recordAggregated(db, captchaFailed));

    expect(ids.size).toBe(1);
    expect(rows()).toHaveLength(1);
    expect(JSON.parse((rows()[0] as { details: string }).details)).toStrictEqual({
      form: 'login',
      count: 1000,
    });
  });

  it('keeps one row per address', () => {
    recordAggregated(db, captchaFailed);
    recordAggregated(db, { ...captchaFailed, ipKey: '203.0.113.6' });
    recordAggregated(db, { ...captchaFailed, ipKey: null });
    recordAggregated(db, { ...captchaFailed, ipKey: null });

    expect(rows().map((r) => [r.ipKey, JSON.parse(r.details).count])).toStrictEqual([
      ['203.0.113.5', 1],
      ['203.0.113.6', 1],
      [null, 2],
    ]);
  });

  it('keeps one row per type', () => {
    recordAggregated(db, { type: 'HONEYPOT_TRIGGERED', requestId: 'r', ipKey: 'a', details: {} });
    recordAggregated(db, { ...captchaFailed, ipKey: 'a' });

    expect(
      rows()
        .map((r) => r.type)
        .sort(),
    ).toStrictEqual(['CAPTCHA_FAILED', 'HONEYPOT_TRIGGERED']);
  });

  it('starts a new row in the next 5-minute bucket, and not a moment before', () => {
    recordAggregated(db, captchaFailed);
    fakeClock.set(new Date(T0.getTime() + AGGREGATION_BUCKET_MS - 1));
    recordAggregated(db, captchaFailed);
    expect(rows()).toHaveLength(1);

    fakeClock.set(new Date(T0.getTime() + AGGREGATION_BUCKET_MS));
    recordAggregated(db, captchaFailed);

    expect(rows().map((r) => JSON.parse(r.details).count)).toStrictEqual([2, 1]);
  });

  it('buckets by the wall clock, so an event late in a bucket does not stretch it', () => {
    fakeClock.set(new Date(T0.getTime() + AGGREGATION_BUCKET_MS - 1000));
    recordAggregated(db, captchaFailed);
    fakeClock.set(new Date(T0.getTime() + AGGREGATION_BUCKET_MS + 1000));
    recordAggregated(db, captchaFailed);

    expect(rows()).toHaveLength(2);
  });

  it('keeps the details and the context of the first occurrence', () => {
    recordAggregated(db, { ...captchaFailed, userAgent: 'first' });
    recordAggregated(db, { ...captchaFailed, userAgent: 'second', requestId: 'later' });

    expect(rows()).toMatchObject([{ userAgent: 'first', requestId: 'req-3' }]);
  });

  it('refuses a type that is not aggregated', () => {
    expect(() => recordAggregated(db, { ...locked } as never)).toThrow(/not an aggregated/);
    expect(rows()).toHaveLength(0);
  });

  it('refuses secret-looking details and drops them in production', () => {
    const bad = { ...captchaFailed, details: { form: 'login', captchaAnswer: 'x' } } as never;
    expect(() => recordAggregated(db, bad)).toThrow(/looks like a secret/);

    vi.stubEnv('NODE_ENV', 'production');
    expect(recordAggregated(db, bad)).toBeUndefined();
    expect(
      recordAggregated(db, { ...captchaFailed, type: 'ACCOUNT_LOCKED' } as never),
    ).toBeUndefined();
    expect(rows()).toHaveLength(0);
  });
});

describe('alerts', () => {
  const dispatcher = (send: AlertDispatcher['send'], id = 'test'): AlertDispatcher => ({
    id,
    send,
  });

  it('sends a CRITICAL event to the dispatchers and records SENT with the time of the attempt', async () => {
    const received: SecurityEventRecord[] = [];
    registerAlertDispatcher(
      dispatcher((event) => {
        received.push(event);
        return Promise.resolve({ outcome: 'SENT' });
      }),
    );

    const id = recordSecurityEvent(db, { ...decoy, userAgent: 'curl/8' });
    expect(row(id as string)?.alertStatus).toBe('PENDING');
    fakeClock.advance(1500);
    await flushPendingAlerts();

    expect(row(id as string)).toMatchObject({
      alertStatus: 'SENT',
      alertAttemptedAt: new Date(T0.getTime() + 1500),
    });
    expect(received).toStrictEqual([
      {
        id,
        type: 'DECOY_RESOURCE_ACCESSED',
        severity: 'CRITICAL',
        occurredAt: T0,
        ipKey: '203.0.113.5',
        loginNormalized: null,
        userId: null,
        honeytokenId: null,
        details: { count: 1, resource: '/api/backup/config' },
        requestId: 'req-2',
      },
    ]);
  });

  it('never hands a dispatcher the user agent or anything the schema did not declare', async () => {
    let seen: SecurityEventRecord | undefined;
    registerAlertDispatcher(
      dispatcher((event) => {
        seen = event;
        return Promise.resolve({ outcome: 'SENT' });
      }),
    );

    recordSecurityEvent(db, { ...decoy, userAgent: 'secret-looking-agent' });
    await flushPendingAlerts();

    expect(JSON.stringify(seen)).not.toContain('secret-looking-agent');
  });

  it('does not alert on an event type that does not ask for it, and records NONE', async () => {
    const send = vi.fn(() => Promise.resolve({ outcome: 'SENT' as const }));
    registerAlertDispatcher(dispatcher(send));

    const id = recordSecurityEvent(db, locked);
    await flushPendingAlerts();

    expect(send).not.toHaveBeenCalled();
    expect(row(id as string)?.alertStatus).toBe('NONE');
  });

  it('records NONE for an alerting event when no dispatcher is registered', async () => {
    const id = recordSecurityEvent(db, decoy);
    await flushPendingAlerts();

    expect(row(id as string)).toMatchObject({ alertStatus: 'NONE', alertAttemptedAt: null });
  });

  it('records SUPPRESSED when the dispatcher deduplicated the alert', async () => {
    registerAlertDispatcher(dispatcher(() => Promise.resolve({ outcome: 'SUPPRESSED' })));

    const id = recordSecurityEvent(db, decoy);
    await flushPendingAlerts();

    expect(row(id as string)?.alertStatus).toBe('SUPPRESSED');
  });

  it('SEC-54 keeps the event and the request successful when a dispatcher throws, and records FAILED', async () => {
    registerAlertDispatcher(
      dispatcher(() => {
        throw new Error('canarytokens is down');
      }),
    );

    const id = recordSecurityEvent(db, decoy);
    expect(id).toBeDefined();
    await flushPendingAlerts();

    expect(row(id as string)).toMatchObject({
      alertStatus: 'FAILED',
      type: 'DECOY_RESOURCE_ACCESSED',
    });
    expect(rows()).toHaveLength(1);
  });

  it('SEC-54 returns at once and records FAILED when a dispatcher hangs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    registerAlertDispatcher(dispatcher(() => new Promise(() => undefined)));

    const id = recordSecurityEvent(db, decoy);
    expect(row(id as string)?.alertStatus).toBe('PENDING');

    await vi.advanceTimersByTimeAsync(3000);
    await flushPendingAlerts();

    expect(row(id as string)?.alertStatus).toBe('FAILED');
  });

  it('survives the database being closed while an alert is in flight', async () => {
    let finish: (() => void) | undefined;
    registerAlertDispatcher(
      dispatcher(
        () =>
          new Promise((resolve) => {
            finish = () => resolve({ outcome: 'SENT' });
          }),
      ),
    );
    recordSecurityEvent(db, decoy);

    db.$client.close();
    finish?.();

    await expect(flushPendingAlerts()).resolves.toBeUndefined();
    db = createMigratedDb(); // for afterEach
  });

  it('flushPendingAlerts resolves at once when nothing is pending', async () => {
    await expect(flushPendingAlerts()).resolves.toBeUndefined();
  });
});

describe('retention from the write path', () => {
  it('purges expired rows when an event is recorded, but at most every 5 minutes', () => {
    const expired = new Date(T0.getTime() - 100 * 24 * 60 * 60 * 1000);
    const insertOld = (id: string) =>
      db
        .insert(securityEvents)
        .values({
          id,
          type: 'ACCOUNT_LOCKED',
          severity: 'INFO',
          occurredAt: expired,
          details: '{}',
          requestId: 'r',
        })
        .run();

    insertOld('old-1');
    recordSecurityEvent(db, locked);
    expect(rows().map((r) => r.id)).not.toContain('old-1');

    insertOld('old-2');
    recordSecurityEvent(db, locked);
    expect(rows().map((r) => r.id)).toContain('old-2');

    fakeClock.advance(5 * 60 * 1000);
    recordSecurityEvent(db, locked);
    expect(rows().map((r) => r.id)).not.toContain('old-2');
  });

  it('uses the retention the administrator configured', () => {
    db.insert(securitySettings).values({ id: 1, securityEventRetentionDays: 7 }).run();
    db.insert(securityEvents)
      .values({
        id: 'eight-days',
        type: 'ACCOUNT_LOCKED',
        severity: 'INFO',
        occurredAt: new Date(T0.getTime() - 8 * 24 * 60 * 60 * 1000),
        details: '{}',
        requestId: 'r',
      })
      .run();

    recordSecurityEvent(db, locked);

    expect(rows().map((r) => r.id)).not.toContain('eight-days');
  });
});
