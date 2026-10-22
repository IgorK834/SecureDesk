import { describe, expect, it } from 'vitest';
import { BANNED_PASSWORDS } from './banned-passwords';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type PasswordPolicySettings,
  type PolicySubject,
  validateNewPassword,
} from './password-policy';

const OFF: PasswordPolicySettings = { minPasswordLength: 12, rejectPersonalDataInPassword: false };
const ON: PasswordPolicySettings = { ...OFF, rejectPersonalDataInPassword: true };

// Three distinct values, so each assertion shows exactly which one matched.
const USER: PolicySubject = { login: 'jdoe42', firstName: 'Anna', lastName: 'Kowalska' };

const emoji = (count: number) => '\u{1F600}'.repeat(count);

describe('length (SEC-09, SEC-10)', () => {
  it('rejects an 11-character password and accepts the 12-character boundary', () => {
    expect(validateNewPassword('qpwoeirutya', USER, OFF)).toStrictEqual(['TOO_SHORT']);
    expect(validateNewPassword('qpwoeirutyal', USER, OFF)).toStrictEqual([]);
  });

  it('rejects the empty password', () => {
    expect(validateNewPassword('', USER, OFF)).toStrictEqual(['TOO_SHORT']);
  });

  it('lets the administrator raise the minimum above 12', () => {
    const strict = { ...OFF, minPasswordLength: 16 };

    expect(validateNewPassword('a'.repeat(15), USER, strict)).toStrictEqual(['TOO_SHORT']);
    expect(validateNewPassword('a'.repeat(16), USER, strict)).toStrictEqual([]);
  });

  // The database refuses a setting below 12 as well, but the policy must not rely on that alone.
  it('never lets a configured minimum drop below the variant-2 floor of 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);

    expect(
      validateNewPassword('a'.repeat(11), USER, { ...OFF, minPasswordLength: 8 }),
    ).toStrictEqual(['TOO_SHORT']);
  });

  it('accepts up to 128 characters and rejects 129', () => {
    expect(MAX_PASSWORD_LENGTH).toBe(128);

    expect(validateNewPassword('a'.repeat(128), USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword('a'.repeat(129), USER, OFF)).toStrictEqual(['TOO_LONG']);
  });
});

describe('Unicode and spaces', () => {
  it('counts code points, so 12 emoji are 12 characters although they take 24 UTF-16 units', () => {
    expect(emoji(12).length).toBe(24);

    expect(validateNewPassword(emoji(12), USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword(emoji(11), USER, OFF)).toStrictEqual(['TOO_SHORT']);
  });

  it('applies the upper bound to code points as well', () => {
    expect(validateNewPassword(emoji(128), USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword(emoji(129), USER, OFF)).toStrictEqual(['TOO_LONG']);
  });

  it('counts accented letters as one character each', () => {
    expect(validateNewPassword('ąćęłńóśźżąćę', USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword('ąćęłńóśźżąć', USER, OFF)).toStrictEqual(['TOO_SHORT']);
  });

  it('accepts a passphrase with spaces', () => {
    expect(validateNewPassword('correct horse battery staple', USER, OFF)).toStrictEqual([]);
  });

  it('never trims: surrounding spaces count towards the length', () => {
    expect(validateNewPassword('abcdefghijk ', USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword(' abcdefghij ', USER, OFF)).toStrictEqual([]);
  });
});

describe('no composition rules for user-chosen passwords', () => {
  // NIST SP 800-63B: forcing character classes only makes passwords more predictable.
  it.each([
    ['lower-case letters only', 'qpwoeirutyal'],
    ['upper-case letters only', 'QPWOEIRUTYAL'],
    ['digits only', '849302716485'],
    ['no symbol', 'Tabletennis2026'],
  ])('accepts %s', (_, password) => {
    expect(validateNewPassword(password, USER, ON)).toStrictEqual([]);
  });
});

describe('personal-data rule enabled (SEC-11)', () => {
  it('rejects a password containing the first name in a different case', () => {
    expect(validateNewPassword('MyANNApassword2026!', USER, ON)).toStrictEqual([
      'CONTAINS_FIRST_NAME',
    ]);
  });

  it('rejects a password containing the login in upper case', () => {
    expect(validateNewPassword('xx-JDOE42-secret-2026', USER, ON)).toStrictEqual([
      'CONTAINS_LOGIN',
    ]);
  });

  it('rejects a password containing the last name in mixed case', () => {
    expect(validateNewPassword('my-KoWaLsKa-password', USER, ON)).toStrictEqual([
      'CONTAINS_LAST_NAME',
    ]);
  });

  it('reports every rule that is broken, in a fixed order', () => {
    expect(validateNewPassword('Anna', USER, ON)).toStrictEqual([
      'TOO_SHORT',
      'CONTAINS_FIRST_NAME',
    ]);
    expect(validateNewPassword('kowalska-anna-jdoe42-2026', USER, ON)).toStrictEqual([
      'CONTAINS_LOGIN',
      'CONTAINS_FIRST_NAME',
      'CONTAINS_LAST_NAME',
    ]);
  });

  it('reports only codes, never the profile data itself', () => {
    const result = JSON.stringify(validateNewPassword('kowalska-anna-jdoe42-2026', USER, ON));

    expect(result).not.toMatch(/kowalska|anna|jdoe/i);
  });

  it('accepts a password that contains none of them', () => {
    expect(validateNewPassword('a tidy phrase of words', USER, ON)).toStrictEqual([]);
  });

  describe('comparison form: NFKC plus lower-case', () => {
    it('matches full-width letters', () => {
      expect(validateNewPassword('my-\uFF21\uFF2E\uFF2E\uFF21-password', USER, ON)).toStrictEqual([
        'CONTAINS_FIRST_NAME',
      ]);
    });

    it('matches an accent typed as a letter plus combining mark against the composed name', () => {
      const jose: PolicySubject = { login: 'jdoe42', firstName: 'Jos\u00E9', lastName: 'Kowalski' };

      expect(validateNewPassword('my-Jose\u0301-password', jose, ON)).toStrictEqual([
        'CONTAINS_FIRST_NAME',
      ]);
    });

    it('is case-insensitive for non-ASCII letters too', () => {
      const zaneta: PolicySubject = {
        login: 'jdoe42',
        firstName: '\u017Baneta',
        lastName: 'Nowak',
      };

      expect(validateNewPassword('my-\u017BANETA-password', zaneta, ON)).toStrictEqual([
        'CONTAINS_FIRST_NAME',
      ]);
    });

    // Documented limitation (docs/architecture.md): accents are not folded away.
    it('does NOT strip diacritics: "Zoe" is not found inside "Zoë"', () => {
      const zoe: PolicySubject = { login: 'jdoe42', firstName: 'Zoe', lastName: 'Nowak' };

      expect(validateNewPassword('MyZo\u00EBPassword2026!', zoe, ON)).toStrictEqual([]);
    });
  });

  describe('values that must never match', () => {
    // `includes('')` is always true: without the guard every password would be rejected.
    it.each([
      ['empty first and last name', { login: 'jdoe42', firstName: '', lastName: '' }],
      ['an empty login', { login: '', firstName: 'Anna', lastName: 'Kowalska' }],
      ['whitespace-only names', { login: 'jdoe42', firstName: '   ', lastName: '\t' }],
    ])('causes no false positive for %s', (_, subject) => {
      expect(validateNewPassword('correct horse battery staple', subject, ON)).toStrictEqual([]);
    });

    it('still matches a name stored with stray surrounding spaces', () => {
      const padded: PolicySubject = { login: 'jdoe42', firstName: ' Anna ', lastName: 'Kowalska' };

      expect(validateNewPassword('MyANNApassword2026!', padded, ON)).toStrictEqual([
        'CONTAINS_FIRST_NAME',
      ]);
    });
  });
});

describe('personal-data rule disabled (SEC-12)', () => {
  it.each(['MyANNApassword2026!', 'xx-JDOE42-secret-2026', 'my-KoWaLsKa-password'])(
    'does not reject %s for containing profile data',
    (password) => {
      expect(validateNewPassword(password, USER, OFF)).toStrictEqual([]);
    },
  );

  it('still applies the length rule', () => {
    expect(validateNewPassword('Anna', USER, OFF)).toStrictEqual(['TOO_SHORT']);
  });

  it('still applies the banned-password list', () => {
    expect(validateNewPassword('password1234', USER, OFF)).toStrictEqual(['COMMON_PASSWORD']);
  });
});

describe('banned passwords', () => {
  it('is a baseline list of a few dozen entries', () => {
    expect(BANNED_PASSWORDS.size).toBeGreaterThanOrEqual(24);
  });

  // An entry shorter than 12 would add nothing: the length rule already refuses it.
  it('holds only passwords that are at least 12 characters, so each one would otherwise pass', () => {
    for (const entry of BANNED_PASSWORDS) {
      expect(Array.from(entry).length, entry).toBeGreaterThanOrEqual(MIN_PASSWORD_LENGTH);
    }
  });

  it('rejects every entry, which also proves each one is stored in the normalized comparison form', () => {
    for (const entry of BANNED_PASSWORDS) {
      expect(validateNewPassword(entry, USER, OFF), entry).toStrictEqual(['COMMON_PASSWORD']);
    }
  });

  it.each([
    ['upper case', 'PASSWORD1234'],
    ['mixed case', 'PassWord1234'],
    [
      'full-width letters',
      '\uFF50\uFF41\uFF53\uFF53\uFF57\uFF4F\uFF52\uFF44\uFF11\uFF12\uFF13\uFF14',
    ],
  ])('compares in the same normalized form: %s is still rejected', (_, password) => {
    expect(validateNewPassword(password, USER, OFF)).toStrictEqual(['COMMON_PASSWORD']);
  });

  // Substring matching would reject honest passphrases that merely mention a common word.
  it('matches the whole password only, not a part of it', () => {
    expect(validateNewPassword('my password1234 phrase', USER, OFF)).toStrictEqual([]);
    expect(validateNewPassword('password12345x', USER, OFF)).toStrictEqual([]);
  });
});
