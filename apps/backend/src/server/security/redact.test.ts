import { describe, expect, it } from 'vitest';
import { REDACTED, redact } from './redact';

// redact() is the last line of defence between a log statement and a credential, so these tests
// check what must never survive, and equally that harmless data is not destroyed.
describe('redact', () => {
  it.each([
    'password',
    'newPassword',
    'currentPassword',
    'passwordHash',
    'password_hash',
    'tokenHash',
    'hash', // matched by "hash" alone: neither "pass" nor "token" is in these names
    'storedHash',
    'sessionToken',
    'csrfToken',
    'cookie',
    'Set-Cookie',
    'Authorization',
    'clientSecret',
    'credentials',
    'PASSWORD',
  ])('replaces the value of "%s"', (key) => {
    expect(redact({ [key]: 'sensitive-value' })).toStrictEqual({ [key]: REDACTED });
  });

  it('replaces sensitive values at any depth, including inside arrays', () => {
    const input = { request: { body: { login: 'a', password: 'p' } }, items: [{ token: 't' }] };

    expect(redact(input)).toStrictEqual({
      request: { body: { login: 'a', password: REDACTED } },
      items: [{ token: REDACTED }],
    });
  });

  it('redacts a whole sensitive subtree, not only strings', () => {
    expect(redact({ credentials: { user: 'a', pin: 1 } })).toStrictEqual({ credentials: REDACTED });
  });

  it('keeps everything else as it was', () => {
    const input = { event: 'auth.login.success', requestId: 'r-1', count: 3, ok: true, none: null };

    expect(redact(input)).toStrictEqual(input);
  });

  it('never modifies the value it is given', () => {
    const input = { password: 'p', nested: { token: 't' } };

    redact(input);

    expect(input).toStrictEqual({ password: 'p', nested: { token: 't' } });
  });

  it('passes primitives through unchanged', () => {
    expect(redact('text')).toBe('text');
    expect(redact(7)).toBe(7);
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it('reduces an Error to its name, because its message can embed query parameters', () => {
    const error = new TypeError('Failed query: insert ... params: $argon2id$v=19$secret-hash');

    expect(redact({ error })).toStrictEqual({ error: { name: 'TypeError' } });
  });

  it('does not loop on circular structures', () => {
    const input: Record<string, unknown> = { id: 1 };
    input.self = input;

    expect(redact(input)).toStrictEqual({ id: 1, self: '[Circular]' });
  });

  it('prints an object that is merely referenced twice in full both times', () => {
    const shared = { id: 1 };

    expect(redact({ a: shared, b: shared })).toStrictEqual({ a: { id: 1 }, b: { id: 1 } });
  });

  it('stops descending after a fixed depth instead of walking arbitrarily deep input', () => {
    let deep: Record<string, unknown> = { leaf: 'x' };
    for (let i = 0; i < 20; i++) deep = { next: deep };

    expect(JSON.stringify(redact(deep))).toContain('[Truncated]');
  });

  it('does not expand objects it cannot inspect safely, such as a Buffer or a Date', () => {
    expect(redact({ raw: Buffer.from('secret-bytes'), at: new Date(0) })).toStrictEqual({
      raw: '[Buffer]',
      at: '[Date]',
    });
  });

  it('handles objects without a prototype', () => {
    const input = Object.assign(Object.create(null) as object, { password: 'p', id: 2 });

    expect(redact(input)).toStrictEqual({ password: REDACTED, id: 2 });
  });
});
