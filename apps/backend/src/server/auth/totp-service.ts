import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { generateSecret, generateURI, verify } from 'otplib';
import type { AppDb } from '../db/connection';
import { type UserRow, users } from '../db/schema';
import { ApiError, UnauthorizedError } from '../http/errors';
import { clock } from '../time/clock';
import { verifyPassword } from './password-hasher';
import {
  type CreatedSession,
  type SessionInfo,
  createSession,
  revokeAllForUser,
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

type CodeResult = { valid: false } | { valid: true; timeStep: number };

async function checkCode(user: UserRow, code: string): Promise<CodeResult> {
  const encrypted = user.totpSecretEncrypted;
  if (!encrypted) throw notEnrolled();
  const result = await verify({
    secret: decryptTotpSecret(encrypted),
    token: code,
    epoch: Math.floor(clock.now().getTime() / 1000),
    epochTolerance: TOTP_PERIOD_SECONDS,
    ...(user.totpLastUsedStep === null ? {} : { afterTimeStep: user.totpLastUsedStep }),
  });
  return result.valid && 'timeStep' in result
    ? { valid: true, timeStep: result.timeStep }
    : { valid: false };
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
): Promise<void> {
  const user = activeUser(db, session.userId);
  if (user.totpEnabledAt) throw alreadyEnabled();
  const result = await checkCode(user, code);
  if (!result.valid) throw invalidCode();

  const now = clock.now();
  const encrypted = user.totpSecretEncrypted;
  if (!encrypted) throw notEnrolled();
  const changed = db
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
}

export async function completeTotpChallenge(
  db: AppDb,
  session: SessionInfo,
  code: string,
): Promise<CreatedSession> {
  const decision = windows.check(
    `session:${session.id}`,
    TOTP_ATTEMPT_LIMIT,
    TOTP_ATTEMPT_WINDOW_MS,
  );
  if (!decision.allowed) {
    throw new ApiError(429, 'RATE_LIMITED', 'Zbyt wiele prób. Spróbuj ponownie później', {
      retryAfterSeconds: decision.retryAfterSeconds,
    });
  }

  const user = activeUser(db, session.userId);
  if (!user.totpEnabledAt || !user.totpSecretEncrypted) throw new UnauthorizedError();
  const result = await checkCode(user, code);
  if (!result.valid) {
    windows.record(`session:${session.id}`, TOTP_ATTEMPT_WINDOW_MS);
    throw invalidCode();
  }

  return db.transaction((tx) => {
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
    if (changed === 0) throw invalidCode();
    revokeSession(tx, session.id);
    return createSession(tx, user.id, 'FULLY_AUTHENTICATED');
  });
}

export async function disableTotp(
  db: AppDb,
  session: SessionInfo,
  currentPassword: string,
  code: string,
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
  const changed = db
    .update(users)
    .set({ totpSecretEncrypted: null, totpEnabledAt: null, totpLastUsedStep: null, updatedAt: now })
    .where(
      and(
        eq(users.id, user.id),
        isNotNull(users.totpEnabledAt),
        eq(users.totpSecretEncrypted, encrypted),
      ),
    )
    .run().changes;
  if (changed === 0) throw notEnrolled();
}

/** Administrator recovery after an out-of-band identity check. Revokes every active session. */
export function resetTotpForUser(db: AppDb, userId: string): void {
  const user = activeUser(db, userId);
  db.transaction((tx) => {
    tx.update(users)
      .set({
        totpSecretEncrypted: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
        updatedAt: clock.now(),
      })
      .where(eq(users.id, user.id))
      .run();
    revokeAllForUser(tx, user.id);
  });
}

export function resetTotpRateLimiterForTests(): void {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Cannot reset TOTP rate limits in production.');
  windows.clear();
}
