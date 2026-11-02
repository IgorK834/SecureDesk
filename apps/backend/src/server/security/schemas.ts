import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../auth/password-policy';

// Input schema of the administrator's security settings endpoint. Strict like every admin body: a
// key that is not one of the eight settings is a 400, never silently ignored.

/** Ten years: beyond that "expires" means "never", which `null` already says. */
export const MAX_PASSWORD_AGE_DAYS = 3650;

/** One day. A session ends after 12 hours whatever the idle timeout, so a larger one changes nothing. */
export const MAX_IDLE_TIMEOUT_MINUTES = 1440;

/**
 * Any non-empty subset of the eight settings. The bounds for the password length are the
 * password policy's own (`MIN_PASSWORD_LENGTH`, `MAX_PASSWORD_LENGTH`), so the policy and what an
 * administrator may configure cannot drift apart; the database refuses a length below the floor
 * as well (`security_settings_min_password_length_check`). `passwordMaxAgeDays: null` turns
 * password expiry off. The four login-protection settings (Module 2) have the ranges of the
 * database CHECKs on `security_settings`: 3-20 failed attempts per login, 5-500 per IP, 3-50
 * distinct logins before a spraying event, 7-365 days of event retention.
 */
export const SecuritySettingsPatch = z
  .object({
    minPasswordLength: z.number().int().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    rejectPersonalDataInPassword: z.boolean(),
    passwordMaxAgeDays: z.number().int().min(1).max(MAX_PASSWORD_AGE_DAYS).nullable(),
    sessionIdleTimeoutMinutes: z.number().int().min(1).max(MAX_IDLE_TIMEOUT_MINUTES),
    maxFailedLoginAttempts: z.number().int().min(3).max(20),
    ipFailedAttemptLimit: z.number().int().min(5).max(500),
    sprayingDistinctLoginThreshold: z.number().int().min(3).max(50),
    securityEventRetentionDays: z.number().int().min(7).max(365),
  })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);

export type SecuritySettingsPatchInput = z.infer<typeof SecuritySettingsPatch>;
