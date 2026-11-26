import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { generateSecret, generateURI, verify } from 'otplib';
import { systemAudit, type AuditContext } from '../audit/context';
import type { AppDb } from '../db/connection';
import { type UserRow, users } from '../db/schema';
import { ApiError, UnauthorizedError } from '../http/errors';
import { clock } from '../time/clock';
import { verifyPassword } from './password-hasher';
import {
  type CreatedSession,
  type SessionInfo,
  createSession,
  revokeSession,
} from './session-service';
import { SlidingWindowRateLimiter } from '../security/rate-limiter';

const ISSUER = 'SecureDesk';
const TOTP_PERIOD_SECONDS = 30;
const TOTP_ATTEMPT_LIMIT = 5;
const TOTP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const windows = new SlidingWindowRateLimiter(clock);

const invalidCode = () =>
  new ApiError(400, 'TOTP_INVALID_CODE', 'Kod uwierzytelniający jest nieprawidłowy');
const alreadyEnabled = () =>
  new ApiError(409, 'TOTP_ALREADY_ENABLED', 'Uwierzytelnianie dwuskładnikowe jest już włączone');
const notEnrolled = () =>
  new ApiError(
    409,
    'TOTP_NOT_ENROLLED',
    'Najpierw rozpocznij konfigurację uwierzytelniania dwuskładnikowego',
  );

function encryptionKey(): Buffer {
  const encoded = process.env.TOTP_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new Error('TOTP_ENCRYPTION_KEY is not set.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32)
    throw new Error('TOTP_ENCRYPTION_KEY must contain exactly 32 base64-encoded bytes.');
  return key;
}

/** AES-256-GCM envelope: version, IV, authentication tag and ciphertext, all base64url. */
export function encryptTotpSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptTotpSecret(envelope: string): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split('.');
  if (version !== 'v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra) {
    throw new Error('Invalid encrypted TOTP secret.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(encodedIv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function activeUser(db: AppDb, userId: string): UserRow {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || user.deletedAt || user.isBlocked) throw new UnauthorizedError();
  return user;
}

type ChallengeFailure = 'INVALID_CODE' | 'REPLAYED_CODE' | 'RATE_LIMITED';
type CodeResult =
  | { valid: false; reason: Exclude<ChallengeFailure, 'RATE_LIMITED'> }
  | { valid: true; timeStep: number };

async function checkCode(
  user: UserRow,
  code: string,
  distinguishReplay = false,
): Promise<CodeResult> {
  const encrypted = user.totpSecretEncrypted;
  if (!encrypted) throw notEnrolled();
  const options = {
    secret: decryptTotpSecret(encrypted),
    token: code,
    epoch: Math.floor(clock.now().getTime() / 1000),
    epochTolerance: TOTP_PERIOD_SECONDS,
  };
  const result = await verify({
    ...options,
    ...(user.totpLastUsedStep === null ? {} : { afterTimeStep: user.totpLastUsedStep }),
  });
  if (result.valid && 'timeStep' in result) return { valid: true, timeStep: result.timeStep };
  // Keep the same replay protection and client error. The second check only classifies the audit reason.
  const replay =
    distinguishReplay && user.totpLastUsedStep !== null && (await verify(options)).valid;
  return { valid: false, reason: replay ? 'REPLAYED_CODE' : 'INVALID_CODE' };
}

function recordChallengeFailure(db: AppDb, audit: AuditContext, reason: ChallengeFailure): void {
  audit.record(
    db,
    {
      action: 'AUTH_TOTP_CHALLENGE',
      outcome: 'FAILURE',
      details: { reason },
    },
    'refusal',
  );
}

export function beginTotpEnrollment(db: AppDb, session: SessionInfo): { otpauthUri: string } {
  const user = activeUser(db, session.userId);
  if (user.totpEnabledAt) throw alreadyEnabled();

  const secret = generateSecret();
  const encrypted = encryptTotpSecret(secret);
  db.update(users)
    .set({
      totpSecretEncrypted: encrypted,
      totpEnabledAt: null,
      totpLastUsedStep: null,
      updatedAt: clock.now(),
    })
    .where(eq(users.id, user.id))
    .run();

  return { otpauthUri: generateURI({ issuer: ISSUER, label: user.login, secret }) };
}

export async function confirmTotpEnrollment(
  db: AppDb,
  session: SessionInfo,
  code: string,
  audit: AuditContext = systemAudit(),
): Promise<void> {
  const user = activeUser(db, session.userId);
  if (user.totpEnabledAt) throw alreadyEnabled();
  const result = await checkCode(user, code);
  if (!result.valid) throw invalidCode();

  const now = clock.now();
  const encrypted = user.totpSecretEncrypted;
  if (!encrypted) throw notEnrolled();
  db.transaction(
    (tx) => {
      const changed = tx
        .update(users)
        .set({ totpEnabledAt: now, totpLastUsedStep: result.timeStep, updatedAt: now })
        .where(
          and(
            eq(users.id, user.id),
            isNull(users.totpEnabledAt),
            eq(users.totpSecretEncrypted, encrypted),
          ),
        )
        .run().changes;
      if (changed === 0) throw alreadyEnabled();
      audit.record(tx, { action: 'TOTP_ENROLLED', outcome: 'SUCCESS', details: {} });
    },
    { behavior: 'immediate' },
  );
}

export async function completeTotpChallenge(
  db: AppDb,
  session: SessionInfo,
  code: string,
  audit: AuditContext = systemAudit(),
): Promise<CreatedSession> {
  const decision = windows.check(
    `session:${session.id}`,
    TOTP_ATTEMPT_LIMIT,
    TOTP_ATTEMPT_WINDOW_MS,
  );
  if (!decision.allowed) {
    recordChallengeFailure(db, audit, 'RATE_LIMITED');
    throw new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele prób. Spróbuj ponownie później', {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  const user = activeUser(db, session.userId);
  if (!user.totpEnabledAt || !user.totpSecretEncrypted) throw new UnauthorizedError();
  const result = await checkCode(user, code, true);
  if (!result.valid) {
    windows.record(`session:${session.id}`, TOTP_ATTEMPT_WINDOW_MS);
    recordChallengeFailure(db, audit, result.reason);
    throw invalidCode();
  }

  const created = db.transaction(
    (tx) => {
      const changed = tx
        .update(users)
        .set({ totpLastUsedStep: result.timeStep, updatedAt: clock.now() })
        .where(
          and(
            eq(users.id, user.id),
            isNotNull(users.totpEnabledAt),
            user.totpLastUsedStep === null
              ? isNull(users.totpLastUsedStep)
              : eq(users.totpLastUsedStep, user.totpLastUsedStep),
          ),
        )
        .run().changes;
      if (changed === 0) return undefined;
      revokeSession(tx, session.id);
      const sessionAfterChallenge = createSession(tx, user.id, 'FULLY_AUTHENTICATED');
      audit.record(tx, { action: 'AUTH_TOTP_CHALLENGE', outcome: 'SUCCESS', details: {} });
      return sessionAfterChallenge;
    },
    { behavior: 'immediate' },
  );
  if (!created) {
    recordChallengeFailure(db, audit, 'INVALID_CODE');
    throw invalidCode();
  }
  return created;
}

export async function disableTotp(
  db: AppDb,
  session: SessionInfo,
  currentPassword: string,
  code: string,
  audit: AuditContext = systemAudit(),
): Promise<void> {
  const user = activeUser(db, session.userId);
  if (!user.totpEnabledAt || !user.totpSecretEncrypted) throw notEnrolled();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw new ApiError(400, 'CURRENT_PASSWORD_INCORRECT', 'Obecne hasło jest niepoprawne');
  }
  const result = await checkCode(user, code);
  if (!result.valid) throw invalidCode();

  const encrypted = user.totpSecretEncrypted;
  if (!encrypted) throw notEnrolled();
  const now = clock.now();
  db.transaction(
    (tx) => {
      const changed = tx
        .update(users)
        .set({
          totpSecretEncrypted: null,
          totpEnabledAt: null,
          totpLastUsedStep: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(users.id, user.id),
            isNotNull(users.totpEnabledAt),
            eq(users.totpSecretEncrypted, encrypted),
          ),
        )
        .run().changes;
      if (changed === 0) throw notEnrolled();
      audit.record(tx, { action: 'TOTP_DISABLED', outcome: 'SUCCESS', details: {} });
    },
    { behavior: 'immediate' },
  );
}

export function resetTotpRateLimiterForTests(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Cannot reset TOTP rate limits in production.');
  windows.clear();
}
