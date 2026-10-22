import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureOutput } from '../__fixtures__/capture-output';
import {
  ARGON2_OPTIONS,
  InvalidPasswordInputError,
  getDummyHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from './password-hasher';

afterEach(() => vi.restoreAllMocks());

/** Splits a PHC string. Parameters are read by name because the library orders them m,p,t. */
function parsePhc(hash: string) {
  const [, algorithm = '', version = '', params = '', salt = ''] = hash.split('$');
  return {
    algorithm,
    version,
    salt,
    params: Object.fromEntries(params.split(',').map((pair) => pair.split('='))) as Record<
      string,
      string
    >,
  };
}

const PASSWORD = 'correct horse battery staple';

describe('ARGON2_OPTIONS', () => {
  it('pins Argon2id at the OWASP baseline so weakening it is a deliberate, visible change', () => {
    expect(ARGON2_OPTIONS).toStrictEqual({
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  });
});

describe('hashPassword', () => {
  it('produces an Argon2id v19 hash that records exactly m=19456, t=2, p=1', async () => {
    const { algorithm, version, params } = parsePhc(await hashPassword(PASSWORD));

    expect(algorithm).toBe('argon2id');
    expect(version).toBe('v=19');
    // The ticket's regex writes the parameters as m,t,p; node-argon2 serializes them m,p,t.
    // Same parameters, different order, so they are compared by name.
    expect(params).toStrictEqual({ m: '19456', t: '2', p: '1' });
  });

  it('never contains the plaintext', async () => {
    const plaintext = 'plaintext-marker-9f3a-should-not-appear';

    expect(await hashPassword(plaintext)).not.toContain(plaintext);
  });

  it('salts every hash: the same password yields two different strings that both verify', async () => {
    const [first, second] = await Promise.all([hashPassword(PASSWORD), hashPassword(PASSWORD)]);

    expect(first).not.toBe(second);
    expect(parsePhc(first).salt).not.toBe(parsePhc(second).salt);
    // 16 random bytes, base64 without padding.
    expect(Buffer.from(parsePhc(first).salt, 'base64')).toHaveLength(16);
    expect(await verifyPassword(first, PASSWORD)).toBe(true);
    expect(await verifyPassword(second, PASSWORD)).toBe(true);
  });

  it('leaves the password exactly as typed: no trimming and no Unicode normalization', async () => {
    const spaced = await hashPassword(' padded password ');
    const composed = await hashPassword('caf\u00e9 au lait'); // é as one code point

    expect(await verifyPassword(spaced, ' padded password ')).toBe(true);
    expect(await verifyPassword(spaced, 'padded password')).toBe(false);
    expect(await verifyPassword(composed, 'cafe\u0301 au lait')).toBe(false); // e + combining accent
  });

  it('accepts a password of exactly 1024 bytes', async () => {
    const hash = await hashPassword('a'.repeat(1024));

    expect(await verifyPassword(hash, 'a'.repeat(1024))).toBe(true);
  });

  it.each([
    ['an empty string', ''],
    ['a 2 KB string', 'a'.repeat(2048)],
    ['1025 bytes', 'a'.repeat(1025)],
    // 400 characters but 1200 UTF-8 bytes: the limit is on bytes, which is what Argon2 processes.
    ['a short string whose UTF-8 encoding exceeds 1024 bytes', '€'.repeat(400)],
    ['undefined', undefined],
    ['null', null],
    ['a number', 12345678],
    ['an object', { password: PASSWORD }],
    ['an array', [PASSWORD]],
    ['a Buffer', Buffer.from(PASSWORD)],
  ])('rejects %s with InvalidPasswordInputError before Argon2 does any work', async (_, input) => {
    const hashSpy = vi.spyOn(argon2, 'hash');

    await expect(hashPassword(input as unknown as string)).rejects.toBeInstanceOf(
      InvalidPasswordInputError,
    );
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it('keeps the rejected input out of the error', async () => {
    const input = 'secret-input-'.repeat(200);

    const error = await hashPassword(input).catch((e: unknown) => e);

    expect((error as Error).message).not.toContain('secret-input');
    expect((error as Error).name).toBe('InvalidPasswordInputError');
  });
});

describe('verifyPassword', () => {
  it('returns true for the right password and false for a wrong one', async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
    expect(await verifyPassword(hash, `${PASSWORD}!`)).toBe(false);
    expect(await verifyPassword(hash, PASSWORD.toUpperCase())).toBe(false);
  });

  it.each([
    ['garbage', 'not-a-hash'],
    ['an empty string', ''],
    ['a SHA-256 hex digest', createHash('sha256').update(PASSWORD).digest('hex')],
    ['a bare prefix', '$argon2id$'],
    ['a prefix followed by garbage', '$argon2id$garbage'],
    ['undefined', undefined],
    ['null', null],
  ])('returns false without throwing for %s as the stored hash', async (_, stored) => {
    await expect(verifyPassword(stored as unknown as string, PASSWORD)).resolves.toBe(false);
  });

  it('returns false for a truncated hash', async () => {
    const hash = await hashPassword(PASSWORD);

    await expect(verifyPassword(hash.slice(0, 60), PASSWORD)).resolves.toBe(false);
  });

  it('accepts only Argon2id: argon2i and argon2d hashes of the right password do not match', async () => {
    const argon2i = await argon2.hash(PASSWORD, { type: argon2.argon2i });
    const argon2d = await argon2.hash(PASSWORD, { type: argon2.argon2d });

    // The library itself would say true for both; the stored-hash format is a security decision.
    expect(await argon2.verify(argon2i, PASSWORD)).toBe(true);
    expect(await verifyPassword(argon2i, PASSWORD)).toBe(false);
    expect(await verifyPassword(argon2d, PASSWORD)).toBe(false);
  });

  it.each([
    ['empty', ''],
    ['over 1024 bytes', 'a'.repeat(1025)],
    ['not a string', 12345 as unknown as string],
  ])('returns false for a candidate that is %s, without calling Argon2', async (_, candidate) => {
    const hash = await hashPassword(PASSWORD);
    const verifySpy = vi.spyOn(argon2, 'verify');

    await expect(verifyPassword(hash, candidate)).resolves.toBe(false);
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it('never writes the password or the hash to any log output', async () => {
    const password = 'log-canary-password-7731';
    const hash = await hashPassword(password);
    const output = captureOutput();

    await hashPassword(password);
    await verifyPassword(hash, password);
    await verifyPassword(hash, 'wrong-canary-9921');
    await verifyPassword('garbage', password);
    await getDummyHash();
    const written = output.lines().join('\n');
    output.restore();

    expect(written).not.toContain('canary');
    expect(written).not.toContain(hash);
  });
});

describe('needsRehash', () => {
  it('is false for a hash made with the current parameters', async () => {
    expect(needsRehash(await hashPassword(PASSWORD))).toBe(false);
  });

  it('flags hashes made with weaker parameters, which still verify until upgraded', async () => {
    const weak = await argon2.hash(PASSWORD, { ...ARGON2_OPTIONS, memoryCost: 4096 });
    const fewerPasses = await argon2.hash(PASSWORD, { ...ARGON2_OPTIONS, timeCost: 1 });

    expect(needsRehash(weak)).toBe(true);
    expect(needsRehash(fewerPasses)).toBe(true);
    expect(await verifyPassword(weak, PASSWORD)).toBe(true);
  });

  it('flags a hash of another Argon2 variant', async () => {
    expect(needsRehash(await argon2.hash(PASSWORD, { type: argon2.argon2i }))).toBe(true);
  });
});

describe('getDummyHash', () => {
  // The cache lives in module state, so each test starts from a freshly loaded module.
  async function freshModule() {
    vi.resetModules();
    return import('./password-hasher');
  }

  it('does no hashing until it is first needed, then hashes exactly once', async () => {
    const hashSpy = vi.spyOn(argon2, 'hash');
    const { getDummyHash: fresh } = await freshModule();
    expect(hashSpy).not.toHaveBeenCalled();

    const first = await fresh();
    const second = await fresh();

    expect(second).toBe(first);
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });

  it('is an Argon2id hash with the same cost as a real one, so an unknown login takes as long', async () => {
    const dummy = parsePhc(await getDummyHash());
    const real = parsePhc(await hashPassword(PASSWORD));

    expect(dummy.algorithm).toBe('argon2id');
    expect(dummy.params).toStrictEqual(real.params);
  });

  it('is built from a fresh random value each time the process starts', async () => {
    const hashSpy = vi.spyOn(argon2, 'hash');
    await (await freshModule()).getDummyHash();
    await (await freshModule()).getDummyHash();

    const [first, second] = hashSpy.mock.calls.map(([plain]) => String(plain));
    expect(first).not.toBe(second);
    expect(first).toHaveLength(64);
  });

  it('does not cache a failure, so one bad moment cannot break every later unknown-user login', async () => {
    const { getDummyHash: fresh } = await freshModule();
    vi.spyOn(argon2, 'hash').mockRejectedValueOnce(new Error('out of memory'));

    await expect(fresh()).rejects.toThrow('out of memory');

    expect(await fresh()).toMatch(/^\$argon2id\$/);
  });
});
