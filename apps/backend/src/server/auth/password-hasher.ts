import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// OWASP Password Storage Cheat Sheet baseline for Argon2id (m=19 MiB, t=2, p=1). Set explicitly,
// never left to library defaults, so the cost is visible and changing it is a deliberate diff;
// tune on the target hardware with `npm run bench:argon2` and record the result in
// docs/architecture.md. The library draws a fresh random 16-byte salt for every hash and encodes
// it, with these parameters, into the returned `$argon2id$...` string. No salt is ever passed in.
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

// Bounds the CPU and memory an attacker can make one request spend on a single password.
const MAX_PASSWORD_BYTES = 1024;

const ARGON2ID_PREFIX = '$argon2id$';

/** The password was not a non-empty string of at most 1024 bytes. Never carries the input. */
export class InvalidPasswordInputError extends Error {
  constructor() {
    super('A password must be a non-empty string of at most 1024 bytes');
    this.name = 'InvalidPasswordInputError';
  }
}

// The password is deliberately never trimmed, normalized or otherwise modified.
function isAcceptablePassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_BYTES
  );
}

/** Hashes a password for storage. The plaintext is never stored, logged or returned. */
export async function hashPassword(plain: string): Promise<string> {
  if (!isAcceptablePassword(plain)) throw new InvalidPasswordInputError();
  return argon2.hash(plain, ARGON2_OPTIONS);
}

/**
 * Checks a candidate against a stored hash. Never throws: anything that is not a verifiable
 * Argon2id hash (garbage, empty, a bare SHA-256 digest, an argon2i/argon2d hash) or not an
 * acceptable password simply does not match. The library would accept argon2i/argon2d hashes
 * and throws on malformed ones, so both are handled here.
 */
export async function verifyPassword(hash: string, candidate: string): Promise<boolean> {
  if (typeof hash !== 'string' || !hash.startsWith(ARGON2ID_PREFIX)) return false;
  if (!isAcceptablePassword(candidate)) return false;
  try {
    return await argon2.verify(hash, candidate);
  } catch {
    return false;
  }
}

/**
 * True when a hash was made with weaker parameters than the current ones, so it can be
 * upgraded after the next successful login. Call it only with a hash that just verified: the
 * library throws on strings that are not argon2 hashes.
 */
export function needsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * A real Argon2id hash (current parameters) of a random value nobody knows. Verifying a login
 * attempt for an unknown user against it costs the same as verifying a real user, so response
 * time does not reveal which logins exist. Computed on first use and then reused; async because
 * hashing is.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString('hex')).catch((error: unknown) => {
    // Do not cache a failure: it would make every later unknown-user login fail as well.
    dummyHash = undefined;
    throw error;
  });
  return dummyHash;
}
