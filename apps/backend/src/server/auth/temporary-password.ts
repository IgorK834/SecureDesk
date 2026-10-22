import { randomInt } from 'node:crypto';

/** An administrator-issued temporary password is valid for 12 hours (variant 2). */
export const TEMPORARY_PASSWORD_TTL_MS = 12 * 60 * 60 * 1000;

const TEMPORARY_PASSWORD_LENGTH = 16;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';
const SPECIALS = '!@#$%^&*-_=+?';
const ALPHABET = LETTERS + DIGITS + SPECIALS;
const REQUIRED_GROUPS = [LETTERS, DIGITS, SPECIALS];

/**
 * A fresh 16-character temporary password containing at least one letter, one digit and one
 * special character (variant 2). Every character comes from `crypto.randomInt`, which is a
 * CSPRNG and free of modulo bias. Candidates that miss a group are discarded and redrawn
 * rather than patched, so each valid password is exactly as likely as any other.
 */
export function generateTemporaryPassword(): string {
  for (;;) {
    let candidate = '';
    for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) {
      candidate += ALPHABET.charAt(randomInt(ALPHABET.length));
    }
    if (REQUIRED_GROUPS.every((group) => [...candidate].some((char) => group.includes(char)))) {
      return candidate;
    }
  }
}
