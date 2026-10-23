import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { passwordHistory, sessions, users } from '../db/schema';
import { ApiError } from '../http/errors';
import { hashPassword, verifyPassword } from './password-hasher';
import {
  PASSWORD_HISTORY_SIZE,
  assertNotReused,
  changeInitialPassword,
  changePassword,
} from './password-service';
import { createSession } from './session-service';
import { applyTemporaryCredential, issueTemporaryCredential } from './temporary-password';

// Wraps the real hashing and verification so a test can count calls, and can make something
// happen while a request is "in the middle" of hashing (the only await between its checks and
// its transaction).
vi.mock('./password-hasher', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password-hasher')>();
  return {
    ...actual,
    hashPassword: vi.fn(actual.hashPassword),
    verifyPassword: vi.fn(actual.verifyPassword),
  };
});

const T0 = new Date('2030-01-01T00:00:00.000Z');
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Distinct, policy-compliant passwords: P[0] is the oldest, and index n was set before n + 1.
const P = Array.from({ length: 8 }, (_, n) => `Regular password number ${n}`);
const NEW_PASSWORD = 'A brand new passphrase 1';

let hashes: string[];
let db: AppDb;
let userId: string;
const fakeClock = new FakeClock(T0);

beforeAll(async () => {
  hashes = await Promise.all(P.map((password) => hashPassword(password)));
  vi.mocked(hashPassword).mockClear();
});

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db = createMigratedDb();
  userId = insertUser(db, {
    login: 'employee1',
    firstName: 'Jan',
    lastName: 'Kowalski',
    passwordHash: hashes[7],
    passwordChangedAt: new Date(T0.getTime() - HOUR_MS),
  });
  vi.mocked(hashPassword).mockClear();
  vi.mocked(verifyPassword).mockClear();
});

afterEach(() => {
  db.$client.close();
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

async function refusal(action: Promise<unknown>): Promise<ApiError> {
  try {
    await action;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the operation to be refused');
}

const userRow = (id: string = userId) => db.select().from(users).where(eq(users.id, id)).get();
const historyOf = (id: string = userId) =>
  db.select().from(passwordHistory).where(eq(passwordHistory.userId, id)).all();
const open = (stage: Parameters<typeof createSession>[2] = 'FULLY_AUTHENTICATED') =>
  createSession(db, userId, stage);

/** One remembered password. `at` is how many minutes before T0 it stopped being the current one. */
function remember(passwordHash: string, minutesAgo: number, id?: string, forUser = userId) {
  db.insert(passwordHistory)
    .values({
      ...(id === undefined ? {} : { id }),
      userId: forUser,
      passwordHash,
      createdAt: new Date(T0.getTime() - minutesAgo * MINUTE_MS),
    })
    .run();
}

async function actualHash(plain: string) {
  return (
    await vi.importActual<typeof import('./password-hasher')>('./password-hasher')
  ).hashPassword(plain);
}

describe('assertNotReused', () => {
  it('refuses the current password', async () => {
    const error = await refusal(assertNotReused(db, userId, P[7] as string));

    expect([error.status, error.code]).toStrictEqual([400, 'PASSWORD_REUSED']);
  });

  it('refuses each of the five most recent previous passwords but accepts the sixth', async () => {
    // Stored out of chronological order, so the window must come from the dates, not insertion.
    for (const n of [3, 6, 1, 5, 2, 4]) remember(hashes[n] as string, 10 - n);

    for (const n of [6, 5, 4, 3, 2]) {
      const error = await refusal(assertNotReused(db, userId, P[n] as string));
      expect(error.code, `password ${n}`).toBe('PASSWORD_REUSED');
    }
    await expect(assertNotReused(db, userId, P[1] as string)).resolves.toBeUndefined();
  });

  // Dates can tie (two rows in one millisecond); the id then decides, the same way every time.
  it('breaks a tie between equally dated entries by id, newest id first', async () => {
    for (let n = 1; n <= 6; n++) remember(hashes[n] as string, 5, `entry-${n}`);

    expect((await refusal(assertNotReused(db, userId, P[2] as string))).code).toBe(
      'PASSWORD_REUSED',
    );
    await expect(assertNotReused(db, userId, P[1] as string)).resolves.toBeUndefined();
  });

  it('accepts a password that was never used', async () => {
    remember(hashes[6] as string, 1);

    await expect(assertNotReused(db, userId, NEW_PASSWORD)).resolves.toBeUndefined();
  });

  it('only looks at the history of this user', async () => {
    const other = insertUser(db, { login: 'employee2' });
    remember(hashes[1] as string, 1, undefined, other);

    await expect(assertNotReused(db, userId, P[1] as string)).resolves.toBeUndefined();
  });

  it('fails loudly, not silently, for a user that does not exist', async () => {
    await expect(assertNotReused(db, 'no-such-user', NEW_PASSWORD)).rejects.toThrow(
      'user not found',
    );
  });

  it('keeps the window at five, as the project decided', () => {
    expect(PASSWORD_HISTORY_SIZE).toBe(5);
  });
});

describe('changePassword', () => {
  const input = (overrides: Partial<Parameters<typeof changePassword>[2]> = {}) => ({
    currentPassword: P[7] as string,
    newPassword: NEW_PASSWORD,
    confirmNewPassword: NEW_PASSWORD,
    ...overrides,
  });

  it('files the old hash in the history and cuts the history back to the five newest', async () => {
    for (let n = 1; n <= 5; n++) remember(`earlier-hash-${n}`, n); // 1 minute ago is the newest
    const { session } = open();

    await changePassword(db, session, input());

    const kept = historyOf().map((row) => row.passwordHash);
    expect(kept.sort()).toStrictEqual(
      [hashes[7], 'earlier-hash-1', 'earlier-hash-2', 'earlier-hash-3', 'earlier-hash-4'].sort(),
    );
  });

  // The delete is `WHERE user_id = ? AND id NOT IN (the user's newest five)`. Without the user
  // condition one user's password change would erase other users' history.
  it('never touches the history of another user', async () => {
    const other = insertUser(db, { login: 'employee2' });
    for (let n = 1; n <= 6; n++) remember(`other-hash-${n}`, n, undefined, other);
    const before = historyOf(other);

    await changePassword(db, open().session, input());

    expect(historyOf(other)).toStrictEqual(before);
  });

  it('starts the history with the old hash for an account that has none yet', async () => {
    await changePassword(db, open().session, input());

    expect(historyOf().map((row) => row.passwordHash)).toStrictEqual([hashes[7]]);
  });

  // A temporary password was chosen by an administrator's generator, not by the user, so it is
  // not a "previous password" the user could be tempted to reuse.
  it('does not remember a temporary password', async () => {
    db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId)).run();

    await changePassword(db, open().session, input());

    expect(historyOf()).toStrictEqual([]);
  });

  it('refuses a wrong current password before it checks or hashes anything else', async () => {
    const error = await refusal(
      changePassword(
        db,
        open().session,
        input({
          currentPassword: 'not the password',
          newPassword: 'short',
          confirmNewPassword: 'x',
        }),
      ),
    );

    expect([error.status, error.code]).toStrictEqual([400, 'CURRENT_PASSWORD_INCORRECT']);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('does not overwrite a password that was replaced while this request was hashing', async () => {
    const { session } = open();
    let reissued: string | undefined;
    vi.mocked(hashPassword).mockImplementationOnce(async (plain) => {
      const credential = await issueTemporaryCredential();
      reissued = credential.hash;
      db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));
      return actualHash(plain);
    });

    const error = await refusal(changePassword(db, session, input()));

    expect([error.status, error.code]).toStrictEqual([409, 'PASSWORD_CHANGE_ALREADY_COMPLETED']);
    expect(userRow()?.passwordHash).toBe(reissued);
    expect(historyOf()).toStrictEqual([]);
    expect(
      db.select().from(sessions).where(eq(sessions.id, session.id)).get()?.revokedAt,
    ).toBeNull();
  });

  it.each([
    ['blocked', { isBlocked: true }],
    ['soft-deleted', { deletedAt: T0 }],
  ])(
    'treats an account that became %s since the request was admitted as not signed in',
    async (_, change) => {
      const { session } = open();
      db.update(users).set(change).where(eq(users.id, userId)).run();
      const before = userRow();

      const error = await refusal(changePassword(db, session, input()));

      expect([error.status, error.code]).toStrictEqual([401, 'AUTH_REQUIRED']);
      expect(userRow()).toStrictEqual(before);
    },
  );

  it('treats a user that no longer exists as not signed in', async () => {
    const { session } = open();

    const error = await refusal(
      changePassword(db, { ...session, userId: 'no-such-user' }, input()),
    );

    expect([error.status, error.code]).toStrictEqual([401, 'AUTH_REQUIRED']);
  });
});

describe('changeInitialPassword', () => {
  const EXPIRY = new Date(T0.getTime() + 12 * HOUR_MS);
  let temporary: Awaited<ReturnType<typeof issueTemporaryCredential>>;

  const input = (overrides: Partial<Parameters<typeof changeInitialPassword>[2]> = {}) => ({
    newPassword: NEW_PASSWORD,
    confirmNewPassword: NEW_PASSWORD,
    ...overrides,
  });

  beforeEach(async () => {
    temporary = await issueTemporaryCredential();
    db.transaction((tx) =>
      applyTemporaryCredential(tx, userId, { ...temporary, expiresAt: EXPIRY }),
    );
    vi.mocked(hashPassword).mockClear();
  });

  it('refuses from the very instant the temporary password expires and ends that session only', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    const otherDevice = open('INITIAL_PASSWORD_CHANGE');
    fakeClock.set(EXPIRY);
    const before = userRow();

    const error = await refusal(changeInitialPassword(db, session, input()));

    expect([error.status, error.code]).toStrictEqual([401, 'AUTH_TEMPORARY_PASSWORD_EXPIRED']);
    const rows = db.select().from(sessions).all();
    expect(rows.find((row) => row.id === session.id)?.revokedAt).toStrictEqual(EXPIRY);
    expect(rows.find((row) => row.id === otherDevice.session.id)?.revokedAt).toBeNull();
    expect(userRow()).toStrictEqual(before);
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it('still accepts the change one millisecond before the deadline', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    fakeClock.set(new Date(EXPIRY.getTime() - 1));

    const result = await changeInitialPassword(db, session, input());

    expect(result.authStage).toBe('FULLY_AUTHENTICATED');
  });

  // The seeded ADMIN's bootstrap password has no deadline (see database-schema.md).
  it('has no deadline when the expiry is NULL', async () => {
    db.update(users).set({ temporaryPasswordExpiresAt: null }).where(eq(users.id, userId)).run();
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    fakeClock.set(new Date(T0.getTime() + 400 * 24 * HOUR_MS));

    const result = await changeInitialPassword(db, session, input());

    expect(result.authStage).toBe('FULLY_AUTHENTICATED');
  });

  it('answers 409 when the change was already completed, and writes nothing', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    await changeInitialPassword(db, session, input());
    const after = userRow();

    const error = await refusal(
      changeInitialPassword(
        db,
        session,
        input({ newPassword: P[0] as string, confirmNewPassword: P[0] as string }),
      ),
    );

    expect([error.status, error.code]).toStrictEqual([409, 'PASSWORD_CHANGE_ALREADY_COMPLETED']);
    expect(userRow()).toStrictEqual(after);
  });

  it('refuses to keep the temporary password, even though it is not in the history', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');

    const error = await refusal(
      changeInitialPassword(
        db,
        session,
        input({ newPassword: temporary.plaintext, confirmNewPassword: temporary.plaintext }),
      ),
    );

    expect([error.status, error.code]).toStrictEqual([400, 'PASSWORD_REUSED']);
    expect(userRow()?.passwordHash).toBe(temporary.hash);
  });

  it('applies the shared history check as well', async () => {
    remember(hashes[3] as string, 1);
    const { session } = open('INITIAL_PASSWORD_CHANGE');

    const error = await refusal(
      changeInitialPassword(
        db,
        session,
        input({ newPassword: P[3] as string, confirmNewPassword: P[3] as string }),
      ),
    );

    expect(error.code).toBe('PASSWORD_REUSED');
  });

  it('never writes the temporary hash to the history', async () => {
    await changeInitialPassword(db, open('INITIAL_PASSWORD_CHANGE').session, input());

    expect(historyOf()).toStrictEqual([]);
  });

  // The guard also holds the hash that was checked. Without that, a request that started before
  // an administrator reissued the password would overwrite the reissued one with the user's choice.
  it('does not overwrite a temporary password an administrator reissued while it was hashing', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    let reissued: string | undefined;
    vi.mocked(hashPassword).mockImplementationOnce(async (plain) => {
      const credential = await issueTemporaryCredential();
      reissued = credential.hash;
      db.transaction((tx) => applyTemporaryCredential(tx, userId, credential));
      return actualHash(plain);
    });

    const error = await refusal(changeInitialPassword(db, session, input()));

    expect([error.status, error.code]).toStrictEqual([409, 'PASSWORD_CHANGE_ALREADY_COMPLETED']);
    expect(userRow()).toMatchObject({ passwordHash: reissued, mustChangePassword: true });
  });

  it('writes nothing when the account stopped owing a change while the request was hashing', async () => {
    const { session } = open('INITIAL_PASSWORD_CHANGE');
    vi.mocked(hashPassword).mockImplementationOnce(async (plain) => {
      db.update(users).set({ mustChangePassword: false }).where(eq(users.id, userId)).run();
      return actualHash(plain);
    });

    const error = await refusal(changeInitialPassword(db, session, input()));

    expect([error.status, error.code]).toStrictEqual([409, 'PASSWORD_CHANGE_ALREADY_COMPLETED']);
    expect(userRow()).toMatchObject({ passwordHash: temporary.hash, mustChangePassword: false });
  });

  it.each([
    ['blocked', { isBlocked: true }],
    ['soft-deleted', { deletedAt: T0 }],
  ])(
    'treats an account that became %s since the request was admitted as not signed in',
    async (_, change) => {
      const { session } = open('INITIAL_PASSWORD_CHANGE');
      db.update(users).set(change).where(eq(users.id, userId)).run();

      const error = await refusal(changeInitialPassword(db, session, input()));

      expect([error.status, error.code]).toStrictEqual([401, 'AUTH_REQUIRED']);
      expect(userRow()?.passwordHash).toBe(temporary.hash);
    },
  );
});
