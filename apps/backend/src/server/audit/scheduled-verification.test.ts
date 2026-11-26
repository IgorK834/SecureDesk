import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { assertAlertFileConfig } from '../alerts/file-alert-dispatcher';
import { db as applicationDb } from '../db/client';
import { createDb, type AppDb } from '../db/connection';
import { runMigrations } from '../db/migrate';
import { auditLog, securityEvents } from '../db/schema';
import { stageDetectionAlert } from '../detection/engine';
import { clearAlertDispatchers } from '../security/alerts';
import { flushPendingAlerts } from '../security/events';
import { appendAuditEntry } from './append';
import { auditAnchorPath } from './anchor';
import { systemAudit } from './context';
import { auditVerifyIntervalMs, verifyIfDue } from './scheduled-verification';
import { verifyAuditChain } from './verify';

const time = new FakeClock('2026-11-26T10:00:00.000Z');
const HOUR = 60 * 60_000;
const input = {
  actorType: 'SYSTEM',
  action: 'AUTH_LOGIN_FAILURE',
  outcome: 'FAILURE',
  details: { reason: 'BAD_CREDENTIALS' },
  requestId: 'schedule-fixture',
} as const;
const globalForDb = globalThis as typeof globalThis & { __securedeskDb?: AppDb };

describe('scheduled verification with disposable database and alert file', () => {
  let tmp: string;
  let filename: string;
  let alertFile: string;
  let db: AppDb;

  const actions = () => db.select().from(auditLog).orderBy(auditLog.seq).all();
  const detections = () => actions().filter(({ action }) => action === 'AUDIT_TAMPER_DETECTED');
  const events = () =>
    db.select().from(securityEvents).where(eq(securityEvents.type, 'DETECTION_ALERT')).all();
  const lines = () =>
    readFileSync(alertFile, 'utf8')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line));

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'securedesk-audit-schedule-'));
    filename = join(tmp, 'audit.sqlite');
    alertFile = join(tmp, 'alerts', 'security-alerts.jsonl');
    // Blank uses the default private path beside this disposable database.
    vi.stubEnv('ALERT_FILE_PATH', '');
    vi.stubEnv('ALERT_WEBHOOK_URL', '');
    vi.stubEnv('TEST_DATABASE_PATH', filename);
    time.set('2026-11-26T10:00:00.000Z');
    time.install();
    db = createDb(filename);
    runMigrations(db);
  });

  afterEach(async () => {
    await flushPendingAlerts();
    globalForDb.__securedeskDb?.$client.close();
    delete globalForDb.__securedeskDb;
    db.$client.close();
    clearAlertDispatchers();
    time.uninstall();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    rmSync(tmp, { recursive: true, force: true });
  });

  it('runs once per hour, remembers the latest check after reopening, and records only a verification', async () => {
    appendAuditEntry(db, input);
    const [first, duplicate] = await Promise.all([verifyIfDue(db), verifyIfDue(db)]);
    expect(first).toMatchObject({ status: 'INTACT', checkedEntries: 1 });
    expect(duplicate).toBeUndefined();
    expect(actions().map(({ action }) => action)).toEqual([
      'AUTH_LOGIN_FAILURE',
      'AUDIT_LOG_VERIFIED',
    ]);
    expect(actions()[1]).toMatchObject({ actorType: 'SYSTEM', outcome: 'SUCCESS' });
    expect(events()).toEqual([]);

    time.advance(HOUR - 1);
    const restarted = createDb(filename);
    try {
      expect(await verifyIfDue(restarted)).toBeUndefined();
      time.advance(1);
      expect(await verifyIfDue(restarted)).toMatchObject({ status: 'INTACT', checkedEntries: 2 });
      expect(await verifyIfDue(db)).toBeUndefined();
    } finally {
      restarted.$client.close();
    }
    expect(actions().filter(({ action }) => action === 'AUDIT_LOG_VERIFIED')).toHaveLength(2);
  });

  it('schedules on the application write path after a commit and ignores a rollback', async () => {
    vi.stubEnv('AUDIT_VERIFY_INTERVAL_MINUTES', '2');
    expect(() =>
      applicationDb.transaction((tx) => {
        appendAuditEntry(tx, input);
        throw new Error('roll back');
      }),
    ).toThrow('roll back');
    await setImmediate();
    expect(actions()).toEqual([]);

    appendAuditEntry(applicationDb, input);
    expect(actions()).toHaveLength(1);
    await setImmediate();
    expect(actions().map(({ action }) => action)).toEqual([
      'AUTH_LOGIN_FAILURE',
      'AUDIT_LOG_VERIFIED',
    ]);
    time.advance(120_000 - 1);
    appendAuditEntry(applicationDb, input);
    await setImmediate();
    expect(actions()).toHaveLength(3);
    time.advance(1);
    appendAuditEntry(applicationDb, input);
    await setImmediate();
    expect(actions()).toHaveLength(5);
  });

  it('SEC-87 records each finding, sends one private CRITICAL alert per signature and admits a distinct finding', async () => {
    const first = appendAuditEntry(db, input);
    const second = appendAuditEntry(db, input);
    await verifyIfDue(db);
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    const update = db.$client.prepare('UPDATE audit_log SET description = ? WHERE seq = ?');
    update.run('Modified fixture', second.seq);

    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('ALERT_WEBHOOK_URL', 'https://alerts.example.invalid/fixture');
    vi.stubEnv('AUDIT_VERIFY_INTERVAL_MINUTES', '1');
    time.advance(HOUR);
    appendAuditEntry(applicationDb, input);
    await setImmediate();
    await flushPendingAlerts();

    const [detection] = detections();
    expect(
      actions()
        .filter(({ action }) => action === 'AUDIT_LOG_VERIFIED')
        .at(-1),
    ).toMatchObject({
      actorType: 'SYSTEM',
      outcome: 'FAILURE',
    });
    expect(detection).toMatchObject({ outcome: 'FAILURE', actorType: 'SYSTEM' });
    expect(JSON.parse(detection!.details)).toEqual({
      firstProblem: { seq: second.seq, id: second.id, kind: 'HASH_MISMATCH' },
    });
    const [line] = lines();
    const [event] = events();
    const alert = actions().find(({ action }) => action === 'ALERT_RAISED');
    expect(line).toEqual({
      alertId: event!.id,
      ruleId: 'AUDIT_TAMPER',
      severity: 'CRITICAL',
      subject: null,
      count: 1,
      windowMinutes: 0,
      time: time.now().toISOString(),
      auditSeq: detection!.seq,
    });
    expect(event).toMatchObject({ severity: 'CRITICAL', alertStatus: 'SENT' });
    expect(JSON.parse(alert!.details)).toMatchObject({ alertId: event!.id });
    expect(statSync(alertFile).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(alertFile)).mode & 0o777).toBe(0o700);
    expect(fetch).toHaveBeenCalledTimes(1);

    time.advance(60_000);
    const reopened = createDb(filename);
    try {
      expect(await verifyIfDue(reopened)).toMatchObject({ status: 'TAMPERED' });
    } finally {
      reopened.$client.close();
    }
    expect(detections()).toHaveLength(2);
    expect(lines()).toHaveLength(1);
    expect(events()).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    update.run('Modified an earlier fixture', first.seq);
    time.advance(60_000);
    expect(await verifyIfDue(db)).toMatchObject({
      status: 'TAMPERED',
      firstProblem: { seq: first.seq, kind: 'HASH_MISMATCH' },
    });
    await flushPendingAlerts();
    expect(detections()).toHaveLength(3);
    expect(lines()).toHaveLength(2);
    expect(events()).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retains the finding when delivery fails and leaves a conflicting file untouched', async () => {
    const row = appendAuditEntry(db, input);
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    db.$client
      .prepare('UPDATE audit_log SET description = ? WHERE seq = ?')
      .run('Modified', row.seq);
    vi.stubEnv('ALERT_FILE_PATH', filename);
    expect(await verifyIfDue(db)).toMatchObject({ status: 'TAMPERED' });
    await flushPendingAlerts();
    expect(detections()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ severity: 'CRITICAL', alertStatus: 'FAILED' });
    expect(db.$client.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('delivers an alert even when the anchor itself is invalid', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    appendAuditEntry(db, input);
    const anchor = auditAnchorPath(filename)!;
    rmSync(anchor);
    symlinkSync(join(tmp, 'missing'), anchor);
    expect(await verifyIfDue(db)).toMatchObject({
      status: 'TAMPERED',
      firstProblem: { kind: 'HEAD_MISMATCH' },
    });
    await flushPendingAlerts();
    expect(lines()).toHaveLength(1);
    expect(events()[0]?.alertStatus).toBe('SENT');
  });

  it('keeps a shared alert id and escapes control characters in dispatch details', async () => {
    const row = appendAuditEntry(db, input);
    const alert = db.transaction((tx) =>
      stageDetectionAlert(db, tx, systemAudit(), {
        ruleId: 'FIXTURE',
        severity: 'WARNING',
        subject: 'Subject\nline',
        count: 1,
        windowMinutes: 5,
        auditSeq: row.seq,
      }),
    );
    alert.afterCommit(db);
    await flushPendingAlerts();
    expect(lines()).toMatchObject([
      { alertId: alert.id, severity: 'WARNING', subject: 'Subject\\u000aline' },
    ]);
    expect(events()).toMatchObject([{ id: alert.id, severity: 'WARNING', alertStatus: 'SENT' }]);
  });

  it('preserves a tail-truncation signature after the verifier appends its own rows', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    appendAuditEntry(db, input);
    await verifyIfDue(db);
    db.$client.exec('DROP TRIGGER audit_log_no_delete');
    db.$client.prepare('DELETE FROM audit_log WHERE seq = ?').run(2);
    time.advance(HOUR);
    const finding = { seq: 2, id: null, kind: 'HEAD_MISMATCH' };
    expect(await verifyIfDue(db)).toMatchObject({ status: 'TAMPERED', firstProblem: finding });
    await flushPendingAlerts();
    time.advance(HOUR);
    expect(await verifyIfDue(db)).toMatchObject({ status: 'TAMPERED', firstProblem: finding });
    expect(lines()).toHaveLength(1);
    expect(events()).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('audit.anchor.write_failed'));
  });

  it('rolls back the verification and all alert rows if the security event insert fails', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    appendAuditEntry(db, input);
    db.$client.exec('DROP TRIGGER audit_log_no_update');
    db.$client.prepare('UPDATE audit_log SET description = ?').run('Modified fixture');
    db.$client.exec(`CREATE TRIGGER fixture_reject_detection
      BEFORE INSERT ON security_events WHEN NEW.type = 'DETECTION_ALERT'
      BEGIN SELECT RAISE(ABORT, 'fixture'); END`);
    expect(await verifyIfDue(db)).toBeUndefined();
    expect(actions()).toHaveLength(1);
    expect(events()).toHaveLength(0);
    expect(() => statSync(alertFile)).toThrow(/ENOENT/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('audit.verification.schedule_failed'));
  });

  it('logs a background recording failure without changing the triggering write', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    appendAuditEntry(db, input);
    db.$client.exec(`CREATE TRIGGER fixture_reject_verification
      BEFORE INSERT ON audit_log WHEN NEW.action = 'AUDIT_LOG_VERIFIED'
      BEGIN SELECT RAISE(ABORT, 'fixture'); END`);
    expect(await verifyIfDue(db)).toBeUndefined();
    expect(actions()).toHaveLength(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('audit.verification.schedule_failed'));
  });

  it('can retry on the next write when a manual verification is already running', async () => {
    for (let i = 0; i < 4; i++) appendAuditEntry(db, input);
    const manual = verifyAuditChain(db, { batchSize: 1 });
    expect(await verifyIfDue(db)).toBeUndefined();
    await manual;
    expect(await verifyIfDue(db)).toMatchObject({ status: 'INTACT', checkedEntries: 4 });
  });

  it('refuses an invalid interval or a served alert path', async () => {
    vi.stubEnv('AUDIT_VERIFY_INTERVAL_MINUTES', '0');
    expect(() => auditVerifyIntervalMs()).toThrow(/positive integer/);
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    expect(await verifyIfDue(db)).toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    vi.stubEnv('ALERT_FILE_PATH', join(tmp, 'public', 'alert.jsonl'));
    expect(() => assertAlertFileConfig()).toThrow(/outside public and frontend/);
    vi.stubEnv('ALERT_FILE_PATH', alertFile);
    mkdirSync(dirname(alertFile), { mode: 0o700 });
    chmodSync(dirname(alertFile), 0o755);
    expect(() => assertAlertFileConfig()).not.toThrow();
  });
});
