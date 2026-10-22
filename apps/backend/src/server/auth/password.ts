import { argon2id, hash } from 'argon2';

// Argon2id with the OWASP Password Storage Cheat Sheet minimum: 19 MiB of memory, 2 passes,
// 1 lane. Set explicitly (not left to library defaults) so the chosen cost is visible and a
// change is a deliberate diff. The library draws a fresh random salt for every call and
// encodes it, with these parameters, into the returned `$argon2id$...` string.
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Hashes a password for storage. The plaintext is never stored, logged or returned. */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length === 0) throw new Error('Cannot hash an empty password');
  return hash(plain, ARGON2_OPTIONS);
}
