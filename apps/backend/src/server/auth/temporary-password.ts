import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { users } from '../db/schema';
import { type Clock, clock } from '../time/clock';
import { hashPassword } from './password-hasher';

// Variant 2: an administrator-issued password is exactly 16 characters with letters, digits and
// special characters, and is valid for exactly 12 hours. Account creation, administrator reset
// and the seed all issue credentials through this module.
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIALS = '!@#$%^&*()-_=+[]{}?';
const POOL = LETTERS + DIGITS + SPECIALS;

export const TEMP_PASSWORD_LENGTH = 16;
export const TEMP_PASSWORD_TTL_MS = 12 * 60 * 60 * 1000;

function pick(characters: string): string {
  // crypto.randomInt is a CSPRNG and free of modulo bias. Math.random must never be used here
  // (ESLint enforces it for the whole server directory).
  return characters.charAt(randomInt(characters.length));
}

/**
 * A fresh temporary password: one character from each group (so the composition rule always
 * holds), the rest from the combined pool, then shuffled so the guaranteed characters do not sit
 * at fixed positions.
 */
export function generateTemporaryPassword(): string {
  const characters = [pick(LETTERS), pick(DIGITS), pick(SPECIALS)];
  while (characters.length < TEMP_PASSWORD_LENGTH) characters.push(pick(POOL));

  // Fisher-Yates, with an unbiased index for every swap.
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j] as string, characters[i] as string];
  }
  return characters.join('');
}

/** Expired from exactly `expiresAt` on: valid at +11h59m59.999s, expired at +12h. */
export function isTemporaryPasswordExpired(expiresAt: Date, now: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

export interface TemporaryCredential {
  /**
   * The password to show once to the administrator. It is held in memory only: never log it,
   * store it, put it in a URL or send it to analytics, and send it only in a `no-store` response.
   */
  plaintext: string;
  /** The Argon2id hash: the only form that is stored. */
  hash: string;
  expiresAt: Date;
}

/**
 * Generates a temporary password and its hash, valid for 12 hours from the moment of the call
 * (taken before hashing, so hashing time can only shorten the window, never extend it).
 */
export async function issueTemporaryCredential(
  source: Clock = clock,
): Promise<TemporaryCredential> {
  const expiresAt = new Date(source.now().getTime() + TEMP_PASSWORD_TTL_MS);
  const plaintext = generateTemporaryPassword();
  return { plaintext, hash: await hashPassword(plaintext), expiresAt };
}

/**
 * Makes `credential` the user's password and forces a change at next login. Takes a transaction
 * handle so the caller can also end the user's sessions atomically. It throws when no such user
 * exists, instead of leaving an administrator holding a password that works for nobody.
 */
export function applyTemporaryCredential(
  tx: Pick<AppDb, 'update'>,
  userId: string,
  credential: Pick<TemporaryCredential, 'hash' | 'expiresAt'>,
): void {
  const { changes } = tx
    .update(users)
    .set({
      passwordHash: credential.hash,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: credential.expiresAt,
      updatedAt: clock.now(),
    })
    .where(eq(users.id, userId))
    .run();
  if (changes === 0) throw new Error('Cannot apply a temporary credential: user not found.');
}
