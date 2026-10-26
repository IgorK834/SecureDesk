import { eq } from 'drizzle-orm';
import { generate } from 'otplib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { sessions, users } from '../db/schema';
import { hashPassword } from './password-hasher';
import { createSession, resolveSession } from './session-service';
import {
  beginTotpEnrollment,
  completeTotpChallenge,
  confirmTotpEnrollment,
  decryptTotpSecret,
  disableTotp,
  encryptTotpSecret,
  resetTotpForUser,
  resetTotpRateLimiterForTests,
} from './totp-service';

const NOW = new Date('2030-01-01T00:00:05.000Z');
const KEY = Buffer.alloc(32, 7).toString('base64');
const clock = new FakeClock(NOW);
let db: AppDb;
let userId: string;

function currentUser() {
  const row = db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) throw new Error('test user missing');
  return row;
}

function secretFrom(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('enrollment URI did not carry a secret');
  return secret;
}

async function codeFor(secret: string): Promise<string> {
  return generate({ secret, epoch: Math.floor(clock.now().getTime() / 1000) });
}

beforeEach(() => {
  process.env.TOTP_ENCRYPTION_KEY = KEY;
  clock.set(NOW);
  clock.install();
  resetTotpRateLimiterForTests();
  db = createMigratedDb();
  userId = insertUser(db);
});

afterEach(() => {
  db.$client.close();
  clock.uninstall();
  resetTotpRateLimiterForTests();
  delete process.env.TOTP_ENCRYPTION_KEY;
});

describe('TOTP secret encryption', () => {
  it('round-trips with AES-256-GCM while the database envelope contains no plaintext', () => {
    const first = encryptTotpSecret('JBSWY3DPEHPK3PXP');
    const second = encryptTotpSecret('JBSWY3DPEHPK3PXP');

    expect(decryptTotpSecret(first)).toBe('JBSWY3DPEHPK3PXP');
    expect(first).not.toContain('JBSWY3DPEHPK3PXP');
    expect(first).not.toBe(second);
  });

  it('rejects a missing or malformed encryption key and a tampered envelope', () => {
    delete process.env.TOTP_ENCRYPTION_KEY;
    expect(() => encryptTotpSecret('secret')).toThrow(/TOTP_ENCRYPTION_KEY/);
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(31).toString('base64');
    expect(() => encryptTotpSecret('secret')).toThrow(/32/);
    process.env.TOTP_ENCRYPTION_KEY = KEY;
    expect(() => decryptTotpSecret('legacy.iv.tag.ciphertext')).toThrow(/Invalid encrypted/);
    expect(() => decryptTotpSecret('v1.iv.tag')).toThrow(/Invalid encrypted/);
    expect(() => decryptTotpSecret('v1.iv.tag.ciphertext.extra')).toThrow(/Invalid encrypted/);
    expect(() => decryptTotpSecret('v1.bad.bad.bad')).toThrow();
  });
});

describe('TOTP enrollment and challenge', () => {
  it('enrolls, stores only encrypted material and requires a TOTP challenge after the next login', async () => {
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    const { otpauthUri } = beginTotpEnrollment(db, full.session);
    const secret = secretFrom(otpauthUri);

    expect(currentUser().totpSecretEncrypted).not.toContain(secret);
    expect(JSON.stringify(currentUser())).not.toContain(secret);
    await confirmTotpEnrollment(db, full.session, await codeFor(secret));
    expect(currentUser().totpEnabledAt).toStrictEqual(NOW);

    clock.advance(30_000);
    const restricted = createSession(db, userId, 'TOTP_CHALLENGE');
    const completed = await completeTotpChallenge(db, restricted.session, await codeFor(secret));

    expect(completed.session.authStage).toBe('FULLY_AUTHENTICATED');
    expect(resolveSession(db, restricted.token)).toBeNull();
    expect(resolveSession(db, completed.token)?.user.id).toBe(userId);
  });

  it('rejects wrong, expired and replayed codes', async () => {
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    const secret = secretFrom(beginTotpEnrollment(db, full.session).otpauthUri);
    const firstCode = await codeFor(secret);

    await expect(confirmTotpEnrollment(db, full.session, '000000')).rejects.toMatchObject({
      code: 'TOTP_INVALID_CODE',
    });
    await confirmTotpEnrollment(db, full.session, firstCode);

    const challenge = createSession(db, userId, 'TOTP_CHALLENGE');
    await expect(completeTotpChallenge(db, challenge.session, firstCode)).rejects.toMatchObject({
      code: 'TOTP_INVALID_CODE',
    });

    clock.advance(90_000);
    const staleCode = await generate({
      secret,
      epoch: Math.floor((clock.now().getTime() - 90_000) / 1000),
    });
    await expect(completeTotpChallenge(db, challenge.session, staleCode)).rejects.toMatchObject({
      code: 'TOTP_INVALID_CODE',
    });
  });

  it('rate-limits the sixth wrong challenge code per session in 15 minutes', async () => {
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    const secret = secretFrom(beginTotpEnrollment(db, full.session).otpauthUri);
    await confirmTotpEnrollment(db, full.session, await codeFor(secret));
    const challenge = createSession(db, userId, 'TOTP_CHALLENGE');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(completeTotpChallenge(db, challenge.session, '000000')).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(completeTotpChallenge(db, challenge.session, '000000')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('rejects enrollment state conflicts and inactive accounts', async () => {
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    await expect(confirmTotpEnrollment(db, full.session, '000000')).rejects.toMatchObject({
      code: 'TOTP_NOT_ENROLLED',
    });

    const secret = secretFrom(beginTotpEnrollment(db, full.session).otpauthUri);
    await confirmTotpEnrollment(db, full.session, await codeFor(secret));
    expect(() => beginTotpEnrollment(db, full.session)).toThrowError(
      expect.objectContaining({ code: 'TOTP_ALREADY_ENABLED' }),
    );

    db.update(users).set({ isBlocked: true }).where(eq(users.id, userId)).run();
    expect(() => beginTotpEnrollment(db, full.session)).toThrowError(
      expect.objectContaining({ code: 'AUTH_REQUIRED' }),
    );
  });
});

describe('TOTP disable and administrator recovery', () => {
  it('requires the current password and a fresh code to disable TOTP', async () => {
    const password = 'Test password 123!';
    db.update(users)
      .set({ passwordHash: await hashPassword(password) })
      .where(eq(users.id, userId))
      .run();
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    const secret = secretFrom(beginTotpEnrollment(db, full.session).otpauthUri);
    await confirmTotpEnrollment(db, full.session, await codeFor(secret));
    clock.advance(30_000);

    await expect(
      disableTotp(db, full.session, 'wrong', await codeFor(secret)),
    ).rejects.toMatchObject({
      code: 'CURRENT_PASSWORD_INCORRECT',
    });
    await disableTotp(db, full.session, password, await codeFor(secret));
    expect(currentUser()).toMatchObject({
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
    });
  });

  it('clears TOTP and revokes all sessions on administrator recovery', async () => {
    const full = createSession(db, userId, 'FULLY_AUTHENTICATED');
    const secret = secretFrom(beginTotpEnrollment(db, full.session).otpauthUri);
    await confirmTotpEnrollment(db, full.session, await codeFor(secret));

    resetTotpForUser(db, userId);

    expect(currentUser().totpSecretEncrypted).toBeNull();
    expect(
      db
        .select()
        .from(sessions)
        .all()
        .every((session) => session.revokedAt !== null),
    ).toBe(true);
  });

  it('does not allow the test-only rate-limit reset in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect(() => resetTotpRateLimiterForTests()).toThrow(/production/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
