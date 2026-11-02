import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_TIMEOUT_MS,
  type AlertDispatcher,
  type SecurityEventRecord,
  clearAlertDispatchers,
  dispatchAlerts,
  listAlertDispatchers,
  registerAlertDispatcher,
  unregisterAlertDispatcher,
} from './alerts';

const EVENT: SecurityEventRecord = {
  id: 'event-1',
  type: 'HONEYTOKEN_TRIGGERED',
  severity: 'CRITICAL',
  occurredAt: new Date('2030-01-01T00:00:00.000Z'),
  ipKey: '203.0.113.5',
  loginNormalized: 'backup_admin',
  userId: null,
  honeytokenId: 'account-trap-backup-admin',
  details: { trapKind: 'ACCOUNT_TRAP' },
  requestId: 'req-1',
};

const dispatcher = (
  id: string,
  send: AlertDispatcher['send'] = () => Promise.resolve({ outcome: 'SENT' }),
): AlertDispatcher => ({ id, send });

beforeEach(() => clearAlertDispatchers());
afterEach(() => {
  clearAlertDispatchers();
  vi.useRealTimers();
});

describe('the dispatcher registry', () => {
  it('starts empty, lists what was registered and forgets what was unregistered', () => {
    expect(listAlertDispatchers()).toStrictEqual([]);

    registerAlertDispatcher(dispatcher('a'));
    registerAlertDispatcher(dispatcher('b'));
    expect(listAlertDispatchers().map((d) => d.id)).toStrictEqual(['a', 'b']);

    unregisterAlertDispatcher('a');
    expect(listAlertDispatchers().map((d) => d.id)).toStrictEqual(['b']);
  });

  it('replaces a dispatcher registered again under the same id', () => {
    const first = dispatcher('canary');
    const second = dispatcher('canary');
    registerAlertDispatcher(first);
    registerAlertDispatcher(second);

    expect(listAlertDispatchers()).toStrictEqual([second]);
  });

  it('clearAlertDispatchers removes them all', () => {
    registerAlertDispatcher(dispatcher('a'));
    clearAlertDispatchers();

    expect(listAlertDispatchers()).toStrictEqual([]);
  });
});

describe('dispatchAlerts', () => {
  it('reports NONE and calls nobody when no dispatcher is registered', async () => {
    expect(await dispatchAlerts(EVENT)).toBe('NONE');
  });

  it('hands every dispatcher the event and reports SENT', async () => {
    const send = vi.fn(() => Promise.resolve({ outcome: 'SENT' as const }));
    registerAlertDispatcher(dispatcher('a', send));
    registerAlertDispatcher(dispatcher('b', send));

    expect(await dispatchAlerts(EVENT)).toBe('SENT');
    expect(send.mock.calls).toStrictEqual([[EVENT], [EVENT]]);
  });

  it('reports SUPPRESSED when every dispatcher deliberately sent nothing', async () => {
    registerAlertDispatcher(dispatcher('a', () => Promise.resolve({ outcome: 'SUPPRESSED' })));

    expect(await dispatchAlerts(EVENT)).toBe('SUPPRESSED');
  });

  it('reports SENT when one dispatcher sent and another suppressed a duplicate', async () => {
    registerAlertDispatcher(dispatcher('a', () => Promise.resolve({ outcome: 'SUPPRESSED' })));
    registerAlertDispatcher(dispatcher('b'));

    expect(await dispatchAlerts(EVENT)).toBe('SENT');
  });

  it('SEC-54 reports FAILED, and does not reject, when a dispatcher rejects', async () => {
    registerAlertDispatcher(
      dispatcher('a', () => Promise.reject(new Error('https://secret.example/x'))),
    );

    await expect(dispatchAlerts(EVENT)).resolves.toBe('FAILED');
  });

  it('SEC-54 reports FAILED when a dispatcher throws synchronously', async () => {
    registerAlertDispatcher(
      dispatcher('a', () => {
        throw new Error('boom');
      }),
    );

    await expect(dispatchAlerts(EVENT)).resolves.toBe('FAILED');
  });

  it('SEC-54 reports FAILED when a dispatcher hangs, after the timeout and not before', async () => {
    vi.useFakeTimers();
    registerAlertDispatcher(dispatcher('hangs', () => new Promise(() => undefined)));
    let status: string | undefined;
    const done = dispatchAlerts(EVENT).then((result) => (status = result));

    await vi.advanceTimersByTimeAsync(ALERT_TIMEOUT_MS - 1);
    expect(status).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(status).toBe('FAILED');
  });

  it('lets one failing dispatcher fail the status without stopping the others', async () => {
    const delivered = vi.fn(() => Promise.resolve({ outcome: 'SENT' as const }));
    registerAlertDispatcher(dispatcher('broken', () => Promise.reject(new Error('x'))));
    registerAlertDispatcher(dispatcher('fine', delivered));

    expect(await dispatchAlerts(EVENT)).toBe('FAILED');
    expect(delivered).toHaveBeenCalledOnce();
  });

  it('honours a shorter timeout passed by the caller', async () => {
    vi.useFakeTimers();
    registerAlertDispatcher(dispatcher('slow', () => new Promise(() => undefined)));
    const done = dispatchAlerts(EVENT, 50);

    await vi.advanceTimersByTimeAsync(50);

    await expect(done).resolves.toBe('FAILED');
  });

  it('leaves no timer behind once the dispatcher has answered', async () => {
    vi.useFakeTimers();
    registerAlertDispatcher(dispatcher('quick'));

    await dispatchAlerts(EVENT);

    expect(vi.getTimerCount()).toBe(0);
  });
});
