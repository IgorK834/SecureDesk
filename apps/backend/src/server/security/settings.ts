import type { AppDb } from '../db/connection';
import { securitySettings } from '../db/schema';

export interface SecuritySettings {
  minPasswordLength: number;
  rejectPersonalDataInPassword: boolean;
  /** NULL: password expiry is disabled. */
  passwordMaxAgeDays: number | null;
  sessionIdleTimeoutMinutes: number;
  /** Failed attempts per login and 15-minute window before the account is locked. */
  maxFailedLoginAttempts: number;
  /** Failed attempts per IP and 15-minute window across all logins before the IP is blocked. */
  ipFailedAttemptLimit: number;
  /** Distinct logins failed from one IP in the window that raise a spraying event. */
  sprayingDistinctLoginThreshold: number;
  /** Purge horizon of `security_events`. */
  securityEventRetentionDays: number;
}

/** What the table's column defaults and the seed produce. A test keeps them from drifting. */
export const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  minPasswordLength: 12,
  rejectPersonalDataInPassword: false,
  passwordMaxAgeDays: null,
  sessionIdleTimeoutMinutes: 15,
  maxFailedLoginAttempts: 5,
  ipFailedAttemptLimit: 20,
  sprayingDistinctLoginThreshold: 8,
  securityEventRetentionDays: 90,
};

/**
 * The current settings. Read on every request that depends on them, so an administrator's change
 * (for example a shorter idle timeout) applies to already open sessions immediately. A database
 * without the settings row behaves as if it held the defaults.
 */
export function readSecuritySettings(db: Pick<AppDb, 'select'>): SecuritySettings {
  const row = db.select().from(securitySettings).get();
  if (!row) return DEFAULT_SECURITY_SETTINGS;
  return {
    minPasswordLength: row.minPasswordLength,
    rejectPersonalDataInPassword: row.rejectPersonalDataInPassword,
    passwordMaxAgeDays: row.passwordMaxAgeDays,
    sessionIdleTimeoutMinutes: row.sessionIdleTimeoutMinutes,
    maxFailedLoginAttempts: row.maxFailedLoginAttempts,
    ipFailedAttemptLimit: row.ipFailedAttemptLimit,
    sprayingDistinctLoginThreshold: row.sprayingDistinctLoginThreshold,
    securityEventRetentionDays: row.securityEventRetentionDays,
  };
}
