import { describe, expect, it } from 'vitest';
import { normalizeLogin } from './login';

const DECOMPOSED_ZOE = 'Zoe\u0301'; // "Zoé" as e + combining acute accent
const COMPOSED_ZOE = 'Zo\u00e9'; // "Zoé" with the precomposed é

describe('normalizeLogin', () => {
  it.each([
    ['letter case', 'Employee1', 'employee1'],
    ['the fixed administrator login', 'ADMIN', 'admin'],
    ['full-width (NFKC compatibility) letters', 'ＥＭＰＬＯＹＥＥ１', 'employee1'],
    ['a decomposed accent versus the composed letter', DECOMPOSED_ZOE, COMPOSED_ZOE],
  ])('treats %s as the same login', (_label, input, other) => {
    expect(normalizeLogin(input)).toBe(normalizeLogin(other));
  });

  it('produces lowercase NFKC output', () => {
    expect(normalizeLogin('Employee1')).toBe('employee1');
    expect(normalizeLogin('ＡＢＣ')).toBe('abc');
    expect(normalizeLogin(DECOMPOSED_ZOE)).toBe('zo\u00e9');
  });

  it('does not collapse different logins into one', () => {
    expect(normalizeLogin('employee1')).not.toBe(normalizeLogin('employee2'));
    expect(normalizeLogin('manager1')).not.toBe(normalizeLogin('manager'));
  });

  it('is stable: a stored normalized value normalizes to itself, so lookups always match', () => {
    const samples = [
      'ADMIN',
      'Employee1',
      'ＥＭＰＬＯＹＥＥ１',
      'İstanbul',
      'Łukasz',
      DECOMPOSED_ZOE,
    ];
    for (const login of samples) {
      const once = normalizeLogin(login);
      expect(normalizeLogin(once)).toBe(once);
    }
  });
});
