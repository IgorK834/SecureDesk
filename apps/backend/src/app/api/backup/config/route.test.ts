import { eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../server/db/client';
import { honeytokens, securityEvents } from '../../../../server/db/schema';
import { AWS_DECOY_ID, seedHoneytokens } from '../../../../server/db/seeds/honeytokens';
import { clearAlertDispatchers } from '../../../../server/security/alerts';
import { flushPendingAlerts } from '../../../../server/security/events';
import { GET } from './route';

setUpSharedTestDb();

beforeEach(() => {
  db.transaction((tx) => seedHoneytokens(tx));
  clearAlertDispatchers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('CANARY_ALERTS_ENABLED', 'false');
});

afterEach(async () => {
  await flushPendingAlerts();
  clearAlertDispatchers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const request = () =>
  GET(
    new NextRequest('http://localhost:3000/api/backup/config', {
      headers: {
        'user-agent': 'attacker-agent with private material',
        'x-forwarded-for': '203.0.113.77',
      },
    }),
  );

describe('GET /api/backup/config decoy', () => {
  it('SEC-53 returns the lure, aggregates access, and sends one request-free webhook alert', async () => {
    vi.stubEnv('TRUST_PROXY', 'true');
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1');
    vi.stubEnv('ALERT_WEBHOOK_URL', 'http://alert-stub.test/critical');
    const accessKey = ['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join('');
    const secretKey = `decoy-${'s'.repeat(34)}`;
    vi.stubEnv('CANARY_DECOY_AWS_ACCESS_KEY_ID', accessKey);
    vi.stubEnv('CANARY_DECOY_AWS_SECRET_ACCESS_KEY', secretKey);
    vi.stubEnv('REAL_DATABASE_PASSWORD', 'must-never-leak');
    const fetchStub = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchStub);

    const first = await request();
    const firstText = await first.text();
    const second = await request();
    await flushPendingAlerts();

    expect(first.status).toBe(200);
    expect(first.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(firstText)).toStrictEqual({
      service: 'securedesk-nightly-backup',
      database_host: 'backup-db.internal',
      object_store_host: 's3.eu-central-1.amazonaws.com',
      login: 'backup_admin',
      bucket: 'securedesk-production-backups',
      region: 'eu-central-1',
      aws_access_key_id: accessKey,
      aws_secret_access_key: secretKey,
    });
    expect(firstText).not.toContain('must-never-leak');
    expect(second.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledOnce();

    const [, init] = fetchStub.mock.calls[0] as unknown as [URL, RequestInit];
    const payload = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toStrictEqual(['eventId', 'severity', 'time', 'type']);
    expect(payload).toMatchObject({ type: 'DECOY_RESOURCE_ACCESSED', severity: 'CRITICAL' });
    expect(JSON.stringify({ headers: init.headers, payload })).not.toMatch(
      /backup_admin|203\.0\.113\.77|attacker-agent|private material|must-never-leak|decoy-ssss/,
    );

    const events = db.select().from(securityEvents).all();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'DECOY_RESOURCE_ACCESSED',
      severity: 'CRITICAL',
      ipKey: '203.0.113.77',
      honeytokenId: AWS_DECOY_ID,
      alertStatus: 'SENT',
    });
    expect(JSON.parse(events[0]?.details ?? '{}')).toEqual({
      count: 2,
      resource: '/api/backup/config',
    });
    expect(
      db.select().from(honeytokens).where(eq(honeytokens.id, AWS_DECOY_ID)).get(),
    ).toMatchObject({ triggerCount: 2 });
  });

  it('works with placeholder credentials when every decoy environment value is absent', async () => {
    const response = await request();
    const body = await response.json();
    await flushPendingAlerts();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      login: 'backup_admin',
      aws_access_key_id: 'DECOY_CREDENTIAL_NOT_CONFIGURED',
      aws_secret_access_key: 'DECOY_CREDENTIAL_NOT_CONFIGURED',
    });
    expect(JSON.stringify(body)).not.toMatch(/undefined|null|\$argon|password_hash/i);
    expect(db.select().from(securityEvents).all()).toMatchObject([
      { type: 'DECOY_RESOURCE_ACCESSED', alertStatus: 'SUPPRESSED' },
    ]);
  });
});
