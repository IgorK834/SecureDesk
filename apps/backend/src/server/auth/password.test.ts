import { verify } from 'argon2';
import { describe, expect, it } from 'vitest';
import { hashPassword } from './password';

describe('hashPassword', () => {
  it('produces an Argon2id encoded hash that verifies only the original password', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(await verify(hash, 'correct horse battery staple')).toBe(true);
    expect(await verify(hash, 'correct horse battery stapl3')).toBe(false);
  });

  it('records the OWASP cost parameters in the hash itself', async () => {
    const hash = await hashPassword('another password');

    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
  });

  it('salts every hash: the same password never yields the same string twice', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same input'),
      hashPassword('same input'),
    ]);

    expect(first).not.toBe(second);
  });

  it('never embeds the plaintext in the hash', async () => {
    const hash = await hashPassword('plaintext-marker-9f3a');

    expect(hash).not.toContain('plaintext-marker-9f3a');
  });

  it('refuses an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty/);
  });
});
