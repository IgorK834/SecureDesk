import { and, isNotNull, lt, ne, or } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { captchaChallenges, loginAttempts, securityEvents } from '../db/schema';
import { readSecuritySettings } from '../security/settings';
import { clock } from '../time/clock';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Login attempts only matter inside the 15-minute window; a day leaves room for investigation. */
export const LOGIN_ATTEMPT_RETENTION_MS = 24 * HOUR_MS;
export const CAPTCHA_CHALLENGE_RETENTION_MS = HOUR_MS;
/** The purge is run from the write path, but at most this often. */
export const PURGE_INTERVAL_MS = 5 * 60 * 1000;

export interface PurgeResult {
  loginAttempts: number;
  captchaChallenges: number;
  securityEvents: number;
}

/**
 * Deletes what is past its horizon (IP addresses and user agents are personal data, so none of
 * it is kept longer than it is useful):
 *
 *  - `login_attempts` older than 24 hours;
 *  - `captcha_challenges` created more than 1 hour ago;
 *  - `security_events` older than `security_event_retention_days`, except an unacknowledged
 *    `CRITICAL` event, which stays until it is twice that old. Nobody has looked at it yet, and
 *    a honeytoken hit that expires unread did its job for no one.
 */
export function purgeExpired(db: AppDb, now: Date = clock.now()): PurgeResult {
  const at = now.getTime();
  const horizonMs = readSecuritySettings(db).securityEventRetentionDays * DAY_MS;

  return db.transaction((tx) => ({
    loginAttempts: tx
      .delete(loginAttempts)
      .where(lt(loginAttempts.occurredAt, new Date(at - LOGIN_ATTEMPT_RETENTION_MS)))
      .run().changes,
    captchaChallenges: tx
      .delete(captchaChallenges)
      .where(lt(captchaChallenges.createdAt, new Date(at - CAPTCHA_CHALLENGE_RETENTION_MS)))
      .run().changes,
    securityEvents: tx
      .delete(securityEvents)
      .where(
        and(
          lt(securityEvents.occurredAt, new Date(at - horizonMs)),
          or(
            ne(securityEvents.severity, 'CRITICAL'),
            isNotNull(securityEvents.acknowledgedAt),
            lt(securityEvents.occurredAt, new Date(at - 2 * horizonMs)),
          ),
        ),
      )
      .run().changes,
  }));
}

// When each connection last purged. Per connection, not per process, so that a test database
// starts with a clean slate and a second database in the same process is not starved.
const lastRun = new WeakMap<AppDb, number>();

/**
 * `purgeExpired`, at most once per `PURGE_INTERVAL_MS` per database. Meant for the write path
 * (every security event recorded calls it), so no scheduler is needed. It never throws: a failed
 * housekeeping run must not fail the request that happened to trigger it. Returns `undefined`
 * when it did not run.
 */
export function purgeIfDue(db: AppDb): PurgeResult | undefined {
  const now = clock.now();
  const previous = lastRun.get(db);
  if (previous !== undefined && now.getTime() - previous < PURGE_INTERVAL_MS) return undefined;
  lastRun.set(db, now.getTime());
  try {
    return purgeExpired(db, now);
  } catch {
    return undefined;
  }
}
