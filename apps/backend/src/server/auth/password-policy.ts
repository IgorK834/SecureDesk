import { BANNED_PASSWORDS } from './banned-passwords';

// Variant 2. The one place that decides whether a password a user chose is acceptable, so every
// flow that sets one (first-login change, ordinary change, later any other) applies the same
// rules on the server, whatever the browser checked. Pure: no I/O, no clock, no randomness.
//
// Deliberately absent: upper-case / lower-case / digit / symbol composition rules. They push
// users to predictable substitutions, and NIST SP 800-63B advises against imposing them on
// passwords people choose. (Temporary passwords have their own composition, see
// temporary-password.ts; that is a generator property, not a rule for user-chosen passwords.)

export type PasswordViolation =
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'CONTAINS_LOGIN'
  | 'CONTAINS_FIRST_NAME'
  | 'CONTAINS_LAST_NAME'
  | 'COMMON_PASSWORD';

/** The profile fields the personal-data rule compares against. */
export interface PolicySubject {
  login: string;
  firstName: string;
  lastName: string;
}

/** The two administrator settings the policy depends on (`security_settings`). */
export interface PasswordPolicySettings {
  minPasswordLength: number;
  rejectPersonalDataInPassword: boolean;
}

/** The variant-2 floor: the configured minimum can raise the requirement, never lower it. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Upper bound, in Unicode code points. It is generous (a passphrase of 20 words fits) and exists
 * so one request cannot make the server hash an arbitrarily long input; 128 code points are at
 * most 512 bytes in UTF-8, safely under the hasher's 1024-byte limit.
 */
export const MAX_PASSWORD_LENGTH = 128;

// The same transform as `normalizeLogin`, kept separate on purpose: that function defines how a
// login is stored, and a change to it must not silently change how passwords are compared.
// NFKC folds compatibility forms (full-width letters, ligatures) and composes accents;
// `toLowerCase()` (not the locale-dependent variant) gives the same result on every machine.
// Diacritics are NOT stripped: the first name "Zoe" is not found inside "MyZoëPassword2026!".
function normalizeForCompare(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

// An empty profile value must never match, or every password would be rejected. A value that is
// only whitespace counts as empty: it would match any password containing a space.
function includesPersonalData(comparablePassword: string, value: string): boolean {
  const needle = normalizeForCompare(value).trim();
  return needle !== '' && comparablePassword.includes(needle);
}

/**
 * Every rule a user-chosen password breaks, in a fixed order; an empty array means acceptable.
 *
 * - Length counts code points, not UTF-16 units or grapheme clusters, so an emoji is one
 *   character: at least `max(12, settings.minPasswordLength)`, at most 128.
 * - The password is never trimmed, and spaces and any other Unicode are allowed.
 * - Only when `rejectPersonalDataInPassword` is on: the password must not contain the login,
 *   first name or last name, in any letter case.
 * - The password must not be one of the very common ones in `BANNED_PASSWORDS`.
 */
export function validateNewPassword(
  password: string,
  user: PolicySubject,
  settings: PasswordPolicySettings,
): PasswordViolation[] {
  const violations: PasswordViolation[] = [];

  const length = Array.from(password).length;
  if (length < Math.max(MIN_PASSWORD_LENGTH, settings.minPasswordLength)) {
    violations.push('TOO_SHORT');
  }
  if (length > MAX_PASSWORD_LENGTH) violations.push('TOO_LONG');

  const comparable = normalizeForCompare(password);
  if (settings.rejectPersonalDataInPassword) {
    if (includesPersonalData(comparable, user.login)) violations.push('CONTAINS_LOGIN');
    if (includesPersonalData(comparable, user.firstName)) violations.push('CONTAINS_FIRST_NAME');
    if (includesPersonalData(comparable, user.lastName)) violations.push('CONTAINS_LAST_NAME');
  }

  if (BANNED_PASSWORDS.has(comparable)) violations.push('COMMON_PASSWORD');

  return violations;
}
