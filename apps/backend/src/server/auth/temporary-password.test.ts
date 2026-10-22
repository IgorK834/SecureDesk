import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPORARY_PASSWORD_TTL_MS, generateTemporaryPassword } from './temporary-password';

afterEach(() => vi.restoreAllMocks());

describe('generateTemporaryPassword (variant 2)', () => {
  // 1000 draws, as in the security test matrix (SEC-08). Roughly one random 16-character string
  // in six lacks a digit or a special character, so a generator that does not enforce the
  // groups fails here with near certainty.
  const samples = Array.from({ length: 1000 }, () => generateTemporaryPassword());

  it('is exactly 16 characters long', () => {
    expect(samples.every((password) => password.length === 16)).toBe(true);
  });

  it('always contains a letter, a digit and a special character', () => {
    for (const password of samples) {
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('uses only typeable ASCII, with no whitespace or quote characters', () => {
    for (const password of samples) {
      expect(password).toMatch(/^[A-Za-z0-9!@#$%^&*\-_=+?]{16}$/);
    }
  });

  it('never repeats, because every draw is random rather than derived from a seed or a default', () => {
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('does not use Math.random, which is not cryptographically secure', () => {
    const random = vi.spyOn(Math, 'random');

    generateTemporaryPassword();

    expect(random).not.toHaveBeenCalled();
  });
});

describe('TEMPORARY_PASSWORD_TTL_MS', () => {
  it('is 12 hours, the variant-2 lifetime', () => {
    expect(TEMPORARY_PASSWORD_TTL_MS).toBe(12 * 60 * 60 * 1000);
  });
});
