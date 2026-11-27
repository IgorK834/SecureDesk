import { z } from 'zod';
import { PASSWORD_VIOLATIONS } from '../auth/password-policy';
import type { AuditLogRow } from '../db/schema';
import { detectionAlertDetails } from '../detection/details';
import { ROLES } from '../permissions/codes';
import { SecuritySettingsPatch } from '../security/schemas';
import { sanitizeForLog } from './sanitize';
import {
  integrityProblem,
  intactVerificationDetails,
  tamperedVerificationDetails,
} from './verification-types';

const empty = z.strictObject({});
const count = z.int().nonnegative();
const seq = z.int().positive();
const auditText = (limit: number) =>
  z
    .string()
    .min(1)
    .max(limit)
    .transform((value) => sanitizeForLog(value, limit));
const role = z.enum(ROLES);
const loginFailure = z.enum([
  'BAD_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'CAPTCHA_FAILED',
  'HONEYPOT',
  'IP_BLOCKED',
]);
const settingChange = z
  .strictObject({
    key: SecuritySettingsPatch.keyof(),
    from: z.union([z.int(), z.boolean(), z.null()]),
    to: z.union([z.int(), z.boolean(), z.null()]),
  })
  .refine(({ key, from, to }) =>
    [from, to].every((value) => SecuritySettingsPatch.safeParse({ [key]: value }).success),
  );

const protectedAccount = z.strictObject({ reason: z.literal('PROTECTED_ACCOUNT') });

function event(description: string, details: z.ZodType = empty) {
  return { description, details };
}

export const AUDIT_ACTIONS = {
  DATABASE_SEEDED: {
    SUCCESS: event(
      'Database seed applied.',
      z.strictObject({ accountsCreated: count, ticketsCreated: count }),
    ),
  },
  RETENTION_PURGED: {
    SUCCESS: event(
      'Expired security data purged.',
      z.strictObject({ attemptsRemoved: count, challengesRemoved: count, eventsRemoved: count }),
    ),
  },
  AUTH_LOGIN_SUCCESS: { SUCCESS: event('Signed in.') },
  AUTH_LOGIN_FAILURE: {
    FAILURE: event('Sign-in refused.', z.strictObject({ reason: loginFailure })),
  },
  AUTH_LOGOUT: { SUCCESS: event('Signed out.') },
  AUTH_SESSION_EXPIRED: {
    SUCCESS: event('Session expired.', z.strictObject({ kind: z.enum(['IDLE', 'ABSOLUTE']) })),
  },
  AUTH_ACCOUNT_LOCKED: {
    SUCCESS: event(
      'Account temporarily locked.',
      z.strictObject({ attempts: seq, lockedUntil: z.iso.datetime() }),
    ),
  },
  AUTH_TRAP_ACCOUNT_USED: {
    FAILURE: event('Trap account used.', z.strictObject({ reason: z.literal('TRAP_ACCOUNT') })),
  },
  AUTH_TOTP_CHALLENGE: {
    SUCCESS: event('Two-factor challenge accepted.'),
    FAILURE: event(
      'Two-factor challenge refused.',
      z.strictObject({ reason: z.enum(['INVALID_CODE', 'REPLAYED_CODE', 'RATE_LIMITED']) }),
    ),
  },
  PASSWORD_CHANGED: {
    SUCCESS: event(
      'Password changed.',
      z.strictObject({ kind: z.enum(['INITIAL', 'ORDINARY', 'EXPIRED']) }),
    ),
  },
  PASSWORD_CHANGE_FAILED: {
    FAILURE: event(
      'Password change refused.',
      z.discriminatedUnion('reason', [
        z.strictObject({
          reason: z.literal('POLICY_VIOLATION'),
          violations: z.array(z.enum(PASSWORD_VIOLATIONS)).min(1),
        }),
        z.strictObject({
          reason: z.enum([
            'CURRENT_PASSWORD_INCORRECT',
            'REUSED',
            'CAPTCHA_FAILED',
            'BRUTE_FORCE_LIMIT',
            'TEMPORARY_PASSWORD_EXPIRED',
            'CONFIRMATION_MISMATCH',
            'ALREADY_COMPLETED',
          ]),
        }),
      ]),
    ),
  },
  PASSWORD_RESET_BY_ADMIN: {
    SUCCESS: event('Password reset by an administrator.'),
    FAILURE: event(
      'Administrator password reset refused.',
      z.strictObject({ reason: z.literal('ACCOUNT_NOT_FOUND') }),
    ),
  },
  USER_CREATED: { SUCCESS: event('User account created.', z.strictObject({ userId: z.uuid() })) },
  USER_UPDATED: {
    SUCCESS: event(
      'User account updated.',
      z.strictObject({
        changedFields: z.array(z.enum(['login', 'firstName', 'lastName'])).max(3),
      }),
    ),
  },
  USER_ROLE_CHANGED: {
    SUCCESS: event('User role changed.', z.strictObject({ from: role, to: role })),
  },
  USER_BLOCKED: {
    SUCCESS: event('User account blocked.'),
    FAILURE: event('User account block refused.', protectedAccount),
  },
  USER_UNBLOCKED: { SUCCESS: event('User account unblocked.') },
  USER_DELETED: {
    SUCCESS: event('User account deleted.'),
    FAILURE: event('User account deletion refused.', protectedAccount),
  },
  USER_UNLOCKED: { SUCCESS: event('Temporary account lock cleared.') },
  USER_TOTP_RESET: { SUCCESS: event('User two-factor enrollment reset.') },
  SETTINGS_CHANGED: {
    SUCCESS: event(
      'Security settings changed.',
      z.strictObject({
        changes: z.array(settingChange).min(1).max(Object.keys(SecuritySettingsPatch.shape).length),
      }),
    ),
  },
  TOTP_ENROLLED: { SUCCESS: event('Two-factor authentication enrolled.') },
  TOTP_DISABLED: { SUCCESS: event('Two-factor authentication disabled.') },
  ACCESS_DENIED: {
    FAILURE: event(
      'Access denied.',
      z.strictObject({
        reason: z.enum(['PERMISSION', 'STAGE', 'TOTP_REQUIRED', 'CSRF']),
        route: auditText(120),
      }),
    ),
  },
  OBJECT_ACCESS_DENIED: {
    FAILURE: event(
      'Resource access denied.',
      z.strictObject({
        reason: z.literal('PERMISSION'),
        resource: z.literal('TICKET'),
      }),
    ),
  },
  DECOY_RESOURCE_ACCESSED: {
    SUCCESS: event(
      'Decoy resource accessed.',
      z.strictObject({ resource: z.literal('/api/backup/config') }),
    ),
  },
  HONEYTOKEN_ALERT_RECEIVED: {
    SUCCESS: event(
      'Received a Canarytokens alert.',
      z.strictObject({
        trapKind: z.enum(['ACCOUNT_TRAP', 'AWS_KEYS']),
        source: z.literal('CANARYTOKENS_WEBHOOK'),
      }),
    ),
  },
  AUDIT_LOG_VIEWED: {
    SUCCESS: event(
      'Audit log viewed.',
      z.strictObject({ sessionRef: z.string().regex(/^[a-f0-9]{64}$/) }),
    ),
  },
  AUDIT_LOG_EXPORTED: {
    SUCCESS: event(
      'Audit log exported.',
      z.strictObject({
        format: z.enum(['csv', 'jsonl']),
        rowCount: count,
        firstSeq: seq.nullable(),
        lastSeq: seq.nullable(),
        filters: z.strictObject({
          user: auditText(128).optional(),
          action: z
            .array(z.string())
            .refine((actions): boolean => actions.every(isAuditAction))
            .optional(),
          outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
          from: z.iso.datetime().optional(),
          to: z.iso.datetime().optional(),
          fromSeq: seq.optional(),
          toSeq: seq.optional(),
        }),
      }),
    ),
  },
  AUDIT_LOG_VERIFIED: {
    SUCCESS: event('Audit log integrity verified.', intactVerificationDetails),
    FAILURE: event('Audit log integrity verification failed.', tamperedVerificationDetails),
  },
  ALERT_RAISED: {
    SUCCESS: event('Security alert raised.', detectionAlertDetails),
  },
  AUDIT_TAMPER_DETECTED: {
    FAILURE: event(
      'Audit log tampering detected.',
      z.strictObject({ firstProblem: integrityProblem }),
    ),
  },
} satisfies Record<string, Partial<Record<AuditLogRow['outcome'], ReturnType<typeof event>>>>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

function isAuditAction(action: string): action is AuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, action);
}

const SECRET_KEY = /password|token|secret|answer|captcha/i;

function assertSafeKeys(value: unknown): void {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  for (const item of pending) {
    if (typeof item !== 'object' || item === null || seen.has(item)) continue;
    seen.add(item);
    for (const [key, child] of Object.entries(item)) {
      if (SECRET_KEY.test(key)) throw new Error('Audit details contain a credential-like key.');
      pending.push(child);
    }
  }
}

export function validateAuditEvent(
  action: string,
  outcome: AuditLogRow['outcome'],
  details: unknown,
) {
  if (!isAuditAction(action)) throw new Error('Undeclared audit action.');

  const outcomes: Partial<Record<AuditLogRow['outcome'], ReturnType<typeof event>>> =
    AUDIT_ACTIONS[action];
  const definition = Object.hasOwn(outcomes, outcome) ? outcomes[outcome] : undefined;
  if (!definition) throw new Error('Outcome is not allowed for this audit action.');

  assertSafeKeys(details);
  const parsed = definition.details.safeParse(details);
  if (!parsed.success) throw new Error('Audit details do not match the declared schema.');
  return { description: definition.description, details: parsed.data };
}
