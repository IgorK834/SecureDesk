import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revokeAllForUser, createSession, resolveSession } from '../auth/session-service';
import type { AppDb } from '../db/connection';
import { createMigratedDb, insertUser } from '../db/__fixtures__/test-db';
import { users } from '../db/schema';
import { blockUser, softDeleteUser, unblockUser } from './account-service';
import { getUser } from './user-queries';

// Each of these operations changes an account and ends its sessions (or reads it back) in one
// transaction. A fault is injected at the last step, after the writes, to prove that nothing of
// them survives: an account that is blocked while its sessions live on is exactly what the single
// transaction prevents. The route tests only see the finished states, so they cannot tell the two
// apart. (`resetPassword` has its own all-or-nothing test in the admin users route tests.)

vi.mock('../auth/session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../auth/session-service')>();
  return { ...actual, revokeAllForUser: vi.fn(actual.revokeAllForUser) };
});
vi.mock('./user-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./user-queries')>();
  return { ...actual, getUser: vi.fn(actual.getUser) };
});

const FAULT = new Error('injected failure before commit');

let db: AppDb;
let userId: string;

beforeEach(() => {
  db = createMigratedDb();
  userId = insertUser(db, {
    login: 'employee1',
    passwordHash: 'old-hash',
    mustChangePassword: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const account = () => db.select().from(users).where(eq(users.id, userId)).get();
const isSignedIn = (token: string) => resolveSession(db, token) !== null;
const openSession = () => createSession(db, userId, 'FULLY_AUTHENTICATED').token;

/** Makes the next session revocation fail, and records what the transaction had written by then. */
function failRevocation<T>(look: () => T): { seen: () => T | undefined } {
  let seen: T | undefined;
  vi.mocked(revokeAllForUser).mockImplementationOnce(() => {
    seen = look();
    throw FAULT;
  });
  return { seen: () => seen };
}

describe('blockUser: all or nothing', () => {
  it('leaves the account unblocked and every session alive when ending the sessions fails', () => {
    const tokens = [openSession(), openSession()];
    const fault = failRevocation(() => account()?.isBlocked);

    expect(() => blockUser(db, userId)).toThrow(FAULT);

    expect(fault.seen()).toBe(true); // the write really was done when the fault hit
    expect(account()?.isBlocked).toBe(false);
    expect(tokens.map(isSignedIn)).toStrictEqual([true, true]);
  });

  it('is not a sticky failure: the same call works afterwards', () => {
    const token = openSession();
    failRevocation(() => undefined);
    expect(() => blockUser(db, userId)).toThrow(FAULT);

    blockUser(db, userId);

    expect(account()?.isBlocked).toBe(true);
    expect(isSignedIn(token)).toBe(false);
  });
});

describe('unblockUser: all or nothing', () => {
  it('leaves the account blocked when reading it back fails', () => {
    db.update(users).set({ isBlocked: true }).where(eq(users.id, userId)).run();
    let seen: boolean | undefined;
    vi.mocked(getUser).mockImplementationOnce(() => {
      seen = account()?.isBlocked;
      throw FAULT;
    });

    expect(() => unblockUser(db, userId)).toThrow(FAULT);

    expect(seen).toBe(false); // the write really was done when the fault hit
    expect(account()?.isBlocked).toBe(true);
  });
});

describe('softDeleteUser: all or nothing', () => {
  it('keeps the account and every session when ending the sessions fails', () => {
    const tokens = [openSession(), openSession()];
    const fault = failRevocation(() => account()?.deletedAt !== null);

    expect(() => softDeleteUser(db, userId)).toThrow(FAULT);

    expect(fault.seen()).toBe(true); // the write really was done when the fault hit
    expect(account()?.deletedAt).toBeNull();
    expect(tokens.map(isSignedIn)).toStrictEqual([true, true]);
  });
});
