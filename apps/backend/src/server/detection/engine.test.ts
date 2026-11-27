import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { assertAlertFileConfig } from '../alerts/file-alert-dispatcher';
import { appendAuditEntry } from '../audit/append';
import type { AuditSubject } from '../audit/subject';
import { createDb, type AppDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { auditLog, securityEvents } from '../db/schema';
import { clearAlertDispatchers } from '../security/alerts';
import { flushPendingAlerts } from '../security/events';
import {
  detectAfterAuditCommit,
  DETECTION_RULES,
  listDetectionRules,
  runDetection,
} from './engine';

const clock = new FakeClock();
const minute = 60_000;
let folder: string;
let db: AppDb;
let alertPath: string;
const account: AuditSubject = { subjectLogin: 'fixture1' };

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'securedesk-detection-'));
  alertPath = join(folder, 'alerts', 'security-alerts.jsonl');
  vi.stubEnv('ALERT_FILE_PATH', alertPath);
  vi.stubEnv('ALERT_WEBHOOK_URL', '');
  clock.set('2030-01-01T00:00:00.000Z');
  clock.install();
  db = createDb(join(folder, 'detection.sqlite'), detectAfterAuditCommit);
  runMigrations(db);
});
afterEach(async () => {
  await delivered();
  db.$client.close();
  clock.uninstall();
  clearAlertDispatchers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(folder, { recursive: true, force: true });
});

function failure(subject: AuditSubject | null = account, reason = 'BAD_CREDENTIALS') {
  return appendAuditEntry(db, {
    actorType: 'ANONYMOUS',
    action: 'AUTH_LOGIN_FAILURE',
    outcome: 'FAILURE',
    ...subject,
    details: { reason },
    requestId: 'detection-fixture',
  });
}

function login(subject: AuditSubject | null = account) {
  return appendAuditEntry(db, {
    actorType: 'SYSTEM',
    action: 'AUTH_LOGIN_SUCCESS',
    outcome: 'SUCCESS',
    ...subject,
    details: {},
    requestId: 'detection-fixture',
  });
}

async function delivered() {
  await setImmediate();
  await flushPendingAlerts();
}

const alerts = () =>
  db.select().from(securityEvents).where(eq(securityEvents.type, 'DETECTION_ALERT')).all();
const auditAlerts = () =>
  db.select().from(auditLog).where(eq(auditLog.action, 'ALERT_RAISED')).orderBy(auditLog.seq).all();

describe('login audit detection', () => {
  it('SEC-88 SEC-91 alerts on the fifth failure and links the audit, security event and private JSON line', async () => {
    const first = failure();
    for (let i = 0; i < 3; i++) failure();
    await delivered();
    expect(alerts()).toHaveLength(0);
    const last = failure();
    await delivered();
    const [event] = alerts();
    const [alert] = auditAlerts();
    expect(alerts()).toHaveLength(1);
    expect(event).toMatchObject({ severity: 'WARNING', alertStatus: 'SENT' });
    expect(alert).toMatchObject({ actorType: 'SYSTEM', subjectLogin: 'fixture1' });
    expect(JSON.parse(alert!.details)).toMatchObject({
      alertId: event!.id,
      ruleId: 'FAILED_LOGIN_BURST',
      firstSeq: first.seq,
      lastSeq: last.seq,
      count: 5,
    });
    expect(JSON.parse(event!.details)).toEqual(JSON.parse(alert!.details));
    expect(
      readFileSync(alertPath, 'utf8')
        .trimEnd()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual([
      {
        alertId: event!.id,
        ruleId: 'FAILED_LOGIN_BURST',
        severity: 'WARNING',
        time: clock.now().toISOString(),
        subject: 'fixture1',
        count: 5,
        windowMinutes: 5,
        auditSeq: last.seq,
      },
    ]);
    expect(statSync(alertPath).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(alertPath)).mode & 0o777).toBe(0o700);
  });

  it('SEC-88 excludes the lower time boundary, other reasons and other subjects', async () => {
    failure();
    clock.advance(5 * minute + 1000);
    for (let i = 0; i < 4; i++) failure();
    failure(account, 'CAPTCHA_FAILED');
    failure({ subjectLogin: 'other-fixture' });
    failure({ subjectRef: 'ref:1234567890123456' });
    failure(null);
    await delivered();
    expect(alerts()).toHaveLength(0);
  });

  it('SEC-93 applies the five-minute cooldown per rule and subject across reopening', async () => {
    const unknown = { subjectRef: 'ref:1234567890123456' };
    for (let i = 0; i < 5; i++) failure(unknown);
    await delivered();
    db.$client.close();
    db = createDb(join(folder, 'detection.sqlite'), detectAfterAuditCommit);
    clock.advance(4 * minute);
    for (let i = 0; i < 5; i++) failure(unknown);
    for (let i = 0; i < 5; i++) failure();
    await delivered();
    expect(alerts()).toHaveLength(2);

    clock.advance(minute);
    failure(unknown);
    await delivered();
    expect(alerts()).toHaveLength(3);
    expect(auditAlerts().at(-1)).toMatchObject({
      subjectLogin: null,
      subjectRef: unknown.subjectRef,
    });
  });

  it('SEC-88 does not count a CAPTCHA refusal between four credential failures', async () => {
    for (let i = 0; i < 3; i++) failure();
    failure(account, 'CAPTCHA_FAILED');
    failure();
    await delivered();
    expect(alerts()).toHaveLength(0);
  });

  it('SEC-90 ignores intervening CAPTCHA failures and resets on the next successful login', async () => {
    const first = failure();
    clock.advance(1000);
    failure(account, 'CAPTCHA_FAILED');
    failure();
    failure();
    clock.advance(2000);
    const success = login();
    login();
    await delivered();
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({ severity: 'CRITICAL', alertStatus: 'SENT' });
    expect(JSON.parse(alerts()[0]!.details)).toMatchObject({
      count: 3,
      elapsedMs: 3000,
      firstSeq: first.seq,
      lastSeq: success.seq,
    });
    expect(listDetectionRules(db)).toMatchObject([
      { threshold: 5, windowMinutes: 5, lastAlertAt: null },
      { threshold: 3, windowMinutes: 10, lastAlertAt: clock.now().toISOString() },
    ]);
  });

  it('SEC-90 skips two failures, failures outside ten minutes, and lock refusals for rule two', async () => {
    failure();
    failure();
    login();
    failure();
    clock.advance(10 * minute + 1);
    failure();
    failure();
    failure(account, 'ACCOUNT_LOCKED');
    login();
    login(null);
    await delivered();
    expect(alerts()).toHaveLength(0);
  });

  it('SEC-66 stores one escaped JSON line for a subject with control characters', async () => {
    const subject = { subjectLogin: 'fixture\nforged\u202e' };
    for (let i = 0; i < 5; i++) failure(subject);
    await delivered();
    const raw = readFileSync(alertPath, 'utf8');
    expect(raw.split('\n')).toHaveLength(2);
    expect(JSON.parse(raw).subject).toBe('fixture\\u000aforged\\u202e');
  });

  it('SEC-92 retains database evidence if the alert directory is unwritable and rejects served paths', async () => {
    mkdirSync(dirname(alertPath), { mode: 0o700 });
    chmodSync(dirname(alertPath), 0o500);
    try {
      for (let i = 0; i < 3; i++) failure();
      expect(login()).toMatchObject({ action: 'AUTH_LOGIN_SUCCESS' });
      await delivered();
      expect(alerts()[0]).toMatchObject({ severity: 'CRITICAL', alertStatus: 'FAILED' });
      expect(auditAlerts()).toHaveLength(1);
    } finally {
      chmodSync(dirname(alertPath), 0o700);
    }
    for (const served of ['public', 'frontend']) {
      vi.stubEnv('ALERT_FILE_PATH', join(folder, served, 'alerts.jsonl'));
      expect(assertAlertFileConfig).toThrow(/outside public and frontend/);
    }
  });

  it('defers rule failures, discards a rolled-back append and ignores internal audit actions', async () => {
    const broken = vi.spyOn(DETECTION_RULES[0]!, 'evaluate').mockImplementation(() => {
      throw new Error('synthetic rule failure');
    });
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const row = failure();
    expect(() =>
      db.transaction((tx) => {
        appendAuditEntry(tx, {
          action: 'AUTH_LOGIN_FAILURE',
          actorType: 'ANONYMOUS',
          outcome: 'FAILURE',
          ...account,
          requestId: row.requestId,
          details: { reason: 'BAD_CREDENTIALS' },
        });
        tx.rollback();
      }),
    ).toThrow();
    expect(broken).not.toHaveBeenCalled();
    await delivered();
    expect(broken).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('detection.rule_failed'));
    expect(alerts()).toHaveLength(0);

    const probe = vi.fn(() => null);
    const rules = [
      {
        ...DETECTION_RULES[0]!,
        appliesTo: ['ALERT_RAISED', 'AUDIT_TAMPER_DETECTED', 'AUDIT_LOG_VERIFIED'] as const,
        evaluate: probe,
      },
    ];
    for (const action of rules[0]!.appliesTo) runDetection(db, { ...row, action }, rules);
    expect(probe).not.toHaveBeenCalled();
  });
});
