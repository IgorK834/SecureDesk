import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { captureOutput } from '../__fixtures__/capture-output';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from './password-hasher';
import {
  TEMP_PASSWORD_LENGTH,
  TEMP_PASSWORD_TTL_MS,
  applyTemporaryCredential,
  generateTemporaryPassword,
  isTemporaryPasswordExpired,
  issueTemporaryCredential,
} from './temporary-password';

// The real Argon2id hashing, wrapped so one test can make it take (fake) time.
vi.mock('./password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password-hasher')>();
  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const SPECIALS = '!@#$%^&*()-_=+[]{}?';

const fakeClock = new FakeClock(T0);
beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
});
afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

describe('generateTemporaryPassword (variant 2, SEC-08)', () => {
  // 1000 draws, as in the security test matrix. About one random 16-character string in six
  // lacks a digit or a special character, so a generator that does not enforce the groups fails
  // here with near certainty.
  const samples = Array.from({ length: 1000 }, () => generateTemporaryPassword());

  it('is exactly 16 characters long', () => {
    expect(TEMP_PASSWORD_LENGTH).toBe(16);
    expect(samples.every((password) => password.length === 16)).toBe(true);
  });

  it('always contains a letter, a digit and a special character', () => {
    for (const password of samples) {
      expect(password).toMatch(/[A-Za-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('uses only typeable ASCII from the documented alphabet, with no whitespace or quotes', () => {
    const allowed = new RegExp(`^[A-Za-z0-9${SPECIALS.replace(/[\]\\^-]/g, '\\$&')}]{16}$`);
    for (const password of samples) expect(password).toMatch(allowed);
  });

  it('does not repeat, because every draw is random rather than derived from a seed or default', () => {
    expect(new Set(samples).size).toBe(samples.length);
  });

  // The guaranteed letter, digit and special character must not sit at fixed positions, or
  // knowing the template would shrink the search space a lot.
  it('varies at every position: at least 10 distinct characters across the samples', () => {
    for (let position = 0; position < TEMP_PASSWORD_LENGTH; position++) {
      const seen = new Set(samples.map((password) => password.charAt(position)));
      expect(seen.size, `position ${position}`).toBeGreaterThanOrEqual(10);
    }
  });

  it('can put a special character at any position, including the first and the last', () => {
    const specialAt = (position: number) =>
      samples.some((password) => SPECIALS.includes(password.charAt(position)));
    expect(specialAt(0)).toBe(true);
    expect(specialAt(TEMP_PASSWORD_LENGTH - 1)).toBe(true);
  });

  it('does not use Math.random, which is not cryptographically secure', () => {
    const random = vi.spyOn(Math, 'random');

    generateTemporaryPassword();

    expect(random).not.toHaveBeenCalled();
  });
});

describe('the 12-hour lifetime (SEC-06, SEC-07)', () => {
  it('is 12 hours, the variant-2 lifetime', () => {
    expect(TEMP_PASSWORD_TTL_MS).toBe(12 * HOUR_MS);
  });

  it('is valid up to 1 ms before the deadline and expired from exactly the deadline on', () => {
    const expiresAt = new Date(T0.getTime() + 12 * HOUR_MS);

    expect(isTemporaryPasswordExpired(expiresAt, new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(isTemporaryPasswordExpired(expiresAt, expiresAt)).toBe(true);
    expect(isTemporaryPasswordExpired(expiresAt, new Date(expiresAt.getTime() + 1))).toBe(true);
  });
});

describe('issueTemporaryCredential', () => {
  it('returns a password that verifies against its Argon2id hash', async () => {
    const credential = await issueTemporaryCredential(fakeClock);

    expect(credential.hash).toMatch(/^\$argon2id\$/);
    expect(credential.hash).not.toContain(credential.plaintext);
    expect(await verifyPassword(credential.hash, credential.plaintext)).toBe(true);
    expect(await verifyPassword(credential.hash, `${credential.plaintext}x`)).toBe(false);
  });

  it('is usable at issue + 11 h 59 min and reported expired at exactly issue + 12 h, by the injected clock', async () => {
    const credential = await issueTemporaryCredential(fakeClock);
    expect(credential.expiresAt).toStrictEqual(new Date(T0.getTime() + 12 * HOUR_MS));

    fakeClock.advance(11 * HOUR_MS + 59 * MINUTE_MS);
    expect(await verifyPassword(credential.hash, credential.plaintext)).toBe(true);
    expect(isTemporaryPasswordExpired(credential.expiresAt, fakeClock.now())).toBe(false);

    fakeClock.advance(MINUTE_MS);
    expect(fakeClock.now()).toStrictEqual(credential.expiresAt);
    expect(isTemporaryPasswordExpired(credential.expiresAt, fakeClock.now())).toBe(true);
  });

  it('measures the 12 hours from before it hashes, so slow hashing never lengthens the window', async () => {
    // Make hashing "take" 5 minutes of fake time. Read before hashing, the expiry is T0 + 12 h;
    // read after, it would be T0 + 12 h 5 min, which is longer than the promised 12 hours.
    const { hashPassword: realHash } =
      await vi.importActual<typeof import('./password-hasher')>('./password-hasher');
    vi.mocked(hashPassword).mockImplementationOnce(async (password) => {
      fakeClock.advance(5 * MINUTE_MS);
      return realHash(password);
    });

    const credential = await issueTemporaryCredential(fakeClock);

    expect(fakeClock.now()).toStrictEqual(new Date(T0.getTime() + 5 * MINUTE_MS));
    expect(credential.expiresAt).toStrictEqual(new Date(T0.getTime() + 12 * HOUR_MS));
  });

  it('issues a different password every time', async () => {
    const first = await issueTemporaryCredential(fakeClock);
    const second = await issueTemporaryCredential(fakeClock);

    expect(first.plaintext).not.toBe(second.plaintext);
    expect(first.hash).not.toBe(second.hash);
  });

  it('uses the system clock when none is injected', async () => {
    fakeClock.uninstall();
    const before = Date.now();

    const { expiresAt } = await issueTemporaryCredential();

    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + TEMP_PASSWORD_TTL_MS);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + TEMP_PASSWORD_TTL_MS);
  });
});

describe('applyTemporaryCredential', () => {
  let db: AppDb;
  let userId: string;

  beforeEach(async () => {
    db = createMigratedDb();
    userId = insertUser(db, {
      passwordHash: await hashPassword('the user’s own chosen password'),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
    });
  });
  afterEach(() => db.$client.close());

  const row = () => db.select().from(users).all()[0];

  it('makes the credential the password, forces a change at next login and sets the 12-hour expiry', async () => {
    fakeClock.advance(HOUR_MS);
    const credential = await issueTemporaryCredential(fakeClock);

    db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));

    expect(row()).toMatchObject({
      passwordHash: credential.hash,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: new Date(T0.getTime() + 13 * HOUR_MS),
      updatedAt: new Date(T0.getTime() + HOUR_MS),
    });
    expect(await verifyPassword(row()?.passwordHash ?? '', credential.plaintext)).toBe(true);
  });

  it('stores the Argon2id hash and no trace of the plaintext anywhere in the row', async () => {
    const credential = await issueTemporaryCredential(fakeClock);

    db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));

    expect(row()?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(db.select().from(users).all())).not.toContain(credential.plaintext);
  });

  it('replaces the previous password, which stops working', async () => {
    const credential = await issueTemporaryCredential(fakeClock);

    db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));

    expect(await verifyPassword(row()?.passwordHash ?? '', 'the user’s own chosen password')).toBe(
      false,
    );
  });

  it('changes only the target user', () => {
    const otherId = insertUser(db, { login: 'employee2', passwordHash: 'other-hash' });
    const before = db
      .select()
      .from(users)
      .all()
      .find((u) => u.id === otherId);

    db.transaction((tx) =>
      applyTemporaryCredential(tx, userId, { hash: 'new-hash', expiresAt: new Date(T0) }),
    );

    expect(
      db
        .select()
        .from(users)
        .all()
        .find((u) => u.id === otherId),
    ).toStrictEqual(before);
  });

  it('throws for a user that does not exist, rather than handing out a password that works for nobody', () => {
    expect(() =>
      db.transaction((tx) =>
        applyTemporaryCredential(tx, 'no-such-user', { hash: 'h', expiresAt: new Date(T0) }),
      ),
    ).toThrow('user not found');
  });
});

describe('the plaintext never reaches any log (log-capture test)', () => {
  it('writes nothing to console or stdout/stderr while issuing and applying a credential', async () => {
    const db = createMigratedDb();
    const userId = insertUser(db);
    const output = captureOutput();

    const credential = await issueTemporaryCredential(fakeClock);
    db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));
    const written = output.lines().join('\n');
    output.restore();
    db.$client.close();

    expect(written).not.toContain(credential.plaintext);
    expect(written).toBe('');
  });
});
