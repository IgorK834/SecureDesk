import type { AlertStatus, SecurityEventSeverity } from '../db/schema';

/** How long one dispatcher may take before its alert counts as failed. */
export const ALERT_TIMEOUT_MS = 3000;

/** A security event as a dispatcher sees it: what happened, never a credential. */
export interface SecurityEventRecord {
  id: string;
  type: string;
  severity: SecurityEventSeverity;
  occurredAt: Date;
  ipKey: string | null;
  loginNormalized: string | null;
  userId: string | null;
  honeytokenId: string | null;
  details: Record<string, unknown>;
  requestId: string;
}

/** `SUPPRESSED`: deliberately not sent, for example a duplicate within the deduplication window. */
export interface AlertResult {
  outcome: 'SENT' | 'SUPPRESSED';
}

/** A way to tell a person about an event (an HTTP call, an e-mail, a chat message). */
export interface AlertDispatcher {
  readonly id: string;
  send(event: SecurityEventRecord): Promise<AlertResult>;
}

const dispatchers = new Map<string, AlertDispatcher>();

/** Adds a dispatcher; one with the same id is replaced. */
export function registerAlertDispatcher(dispatcher: AlertDispatcher): void {
  dispatchers.set(dispatcher.id, dispatcher);
}

export function unregisterAlertDispatcher(id: string): void {
  dispatchers.delete(id);
}

export function listAlertDispatchers(): readonly AlertDispatcher[] {
  return [...dispatchers.values()];
}

/** Removes every dispatcher. For tests, which must not see each other's registrations. */
export function clearAlertDispatchers(): void {
  dispatchers.clear();
}

/** Rejects when `promise` has not settled after `ms`. The timer never keeps the process alive. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('alert dispatcher timed out')), ms);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Sends `event` to every registered dispatcher in parallel, each under its own timeout, and says
 * how it went. Never rejects: a dispatcher that throws (also synchronously), rejects or hangs only
 * makes the result `FAILED`. The content of the failure is dropped on purpose, because it may
 * embed the URL or key of the alert channel.
 */
export async function dispatchAlerts(
  event: SecurityEventRecord,
  timeoutMs: number = ALERT_TIMEOUT_MS,
): Promise<AlertStatus> {
  const targets = listAlertDispatchers();
  if (targets.length === 0) return 'NONE';

  const outcomes = await Promise.all(
    targets.map(async (target): Promise<'SENT' | 'SUPPRESSED' | 'FAILED'> => {
      try {
        const result = await withTimeout((async () => target.send(event))(), timeoutMs);
        return result?.outcome === 'SUPPRESSED' ? 'SUPPRESSED' : 'SENT';
      } catch {
        return 'FAILED';
      }
    }),
  );

  if (outcomes.includes('FAILED')) return 'FAILED';
  return outcomes.every((outcome) => outcome === 'SUPPRESSED') ? 'SUPPRESSED' : 'SENT';
}
