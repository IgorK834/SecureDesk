import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { E2E_DATABASE_PATH } from './helpers';

test('SEC-53: robots advertises the backup decoy and access records a critical event', async ({
  request,
}) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain('Disallow: /api/backup/');

  const response = await request.get('/api/backup/config', {
    headers: { 'X-Forwarded-For': '198.51.100.241' },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(await response.json()).toEqual({
    service: 'securedesk-nightly-backup',
    database_host: 'backup-db.internal',
    object_store_host: 's3.eu-central-1.amazonaws.com',
    login: 'backup_admin',
    bucket: 'securedesk-production-backups',
    region: 'eu-central-1',
    aws_access_key_id: 'DECOY_CREDENTIAL_NOT_CONFIGURED',
    aws_secret_access_key: 'DECOY_CREDENTIAL_NOT_CONFIGURED',
  });

  await expect
    .poll(() => {
      const database = new Database(E2E_DATABASE_PATH, { readonly: true });
      try {
        return database
          .prepare(
            `SELECT type, severity, honeytoken_id, alert_status
               FROM security_events
              WHERE type = 'DECOY_RESOURCE_ACCESSED'
              ORDER BY occurred_at DESC
              LIMIT 1`,
          )
          .get();
      } finally {
        database.close();
      }
    })
    .toEqual({
      type: 'DECOY_RESOURCE_ACCESSED',
      severity: 'CRITICAL',
      honeytoken_id: 'decoy-aws-keys',
      alert_status: 'SUPPRESSED',
    });
});
