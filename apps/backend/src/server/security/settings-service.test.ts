import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { createDb } from '../db/connection';
import type { AppDb } from '../db/connection';
import { createMigratedDb, insertUser, sqliteCode } from '../db/__fixtures__/test-db';
import { runMigrations } from '../db/migrate';
import { securitySettings } from '../db/schema';
import { seedSecuritySettings } from '../db/seeds/security-settings';
import { MAX_IDLE_TIMEOUT_MINUTES, MAX_PASSWORD_AGE_DAYS, SecuritySettingsPatch } from './schemas';
import { getSecuritySettings, updateSecuritySettings } from './settings-service';
import { DEFAULT_SECURITY_SETTINGS } from './settings';

const T0 = new Date('2030-01-01T00:00:00.000Z');
const fakeClock = new FakeClock(T0);

let db: AppDb;
let adminId: string;
beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  db = createMigratedDb();
  adminId = insertUser(db, { login: 'ADMIN' });
});
afterEach(() => {
  fakeClock.uninstall();
  db.$client.close();
});

const row = () => db.select().from(securitySettings).get();
const rows = () => db.select().from(securitySettings).all();

/** Every setting away from its default, so a patch that disturbs another one is visible. */
const CUSTOM = {
  minPasswordLength: 20,
  rejectPersonalDataInPassword: true,
  passwordMaxAgeDays: 90,
  sessionIdleTimeoutMinutes: 30,
};

describe('updateSecuritySettings', () => {
  beforeEach(() => {
    db.transaction((tx) => seedSecuritySettings(tx));
    db.update(securitySettings).set(CUSTOM).run();
  });

  it.each([
    ['minPasswordLength', 14],
    ['rejectPersonalDataInPassword', false],
    ['passwordMaxAgeDays', 365],
    ['sessionIdleTimeoutMinutes', 5],
  ] as const)('changes %s and leaves the other three as they were', (key, value) => {
    const result = updateSecuritySettings(db, adminId, { [key]: value });

    expect(result).toStrictEqual({ ...CUSTOM, [key]: value });
    expect(getSecuritySettings(db)).toStrictEqual({ ...CUSTOM, [key]: value });
  });

  it('changes several settings in one call', () => {
    const result = updateSecuritySettings(db, adminId, {
      minPasswordLength: 16,
      sessionIdleTimeoutMinutes: 10,
    });

    expect(result).toStrictEqual({
      ...CUSTOM,
      minPasswordLength: 16,
      sessionIdleTimeoutMinutes: 10,
    });
  });

  it('turns password expiry off with null, and on again with a number', () => {
    expect(
      updateSecuritySettings(db, adminId, { passwordMaxAgeDays: null }).passwordMaxAgeDays,
    ).toBeNull();
    expect(updateSecuritySettings(db, adminId, { passwordMaxAgeDays: 45 }).passwordMaxAgeDays).toBe(
      45,
    );
  });

  it('records who changed the settings and when', () => {
    fakeClock.set(new Date('2030-06-01T12:00:00.000Z'));

    updateSecuritySettings(db, adminId, { minPasswordLength: 16 });

    expect(row()).toMatchObject({
      updatedBy: adminId,
      updatedAt: new Date('2030-06-01T12:00:00.000Z'),
    });
  });

  it('records the latest change, not the first', () => {
    const other = insertUser(db, { login: 'second.admin' });
    updateSecuritySettings(db, adminId, { minPasswordLength: 16 });
    fakeClock.advance(60_000);

    updateSecuritySettings(db, other, { minPasswordLength: 18 });

    expect(row()).toMatchObject({ updatedBy: other, updatedAt: new Date(T0.getTime() + 60_000) });
  });

  it('keeps the single row: a second change updates it and adds none', () => {
    updateSecuritySettings(db, adminId, { minPasswordLength: 16 });
    updateSecuritySettings(db, adminId, { minPasswordLength: 18 });

    expect(rows()).toHaveLength(1);
    expect(row()?.id).toBe(1);
  });

  it('applies a change that sets a value the row already has, still recording the change', () => {
    fakeClock.advance(1000);

    updateSecuritySettings(db, adminId, { minPasswordLength: CUSTOM.minPasswordLength });

    expect(getSecuritySettings(db)).toStrictEqual(CUSTOM);
    expect(row()?.updatedAt).toStrictEqual(new Date(T0.getTime() + 1000));
  });
});

describe('updateSecuritySettings on a database that has no settings row', () => {
  it('starts from the defaults, applies the patch and creates the one row', () => {
    expect(rows()).toHaveLength(0);

    const result = updateSecuritySettings(db, adminId, { sessionIdleTimeoutMinutes: 5 });

    expect(result).toStrictEqual({ ...DEFAULT_SECURITY_SETTINGS, sessionIdleTimeoutMinutes: 5 });
    expect(rows()).toHaveLength(1);
    expect(row()).toMatchObject({ id: 1, updatedBy: adminId, updatedAt: T0 });
  });
});

describe('getSecuritySettings', () => {
  it('sees a change at once, because nothing is cached between calls', () => {
    updateSecuritySettings(db, adminId, { minPasswordLength: 16 });
    expect(getSecuritySettings(db).minPasswordLength).toBe(16);

    db.update(securitySettings)
      .set({ minPasswordLength: 24 })
      .where(eq(securitySettings.id, 1))
      .run();

    expect(getSecuritySettings(db).minPasswordLength).toBe(24);
  });

  it('answers with the defaults before anything was ever stored', () => {
    expect(getSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
  });
});

// SEC-23: Zod is the first line, but the rule "never below 12" must hold even when something
// above the service forgets it, so the database is the second.
describe('the floor of 12 characters, without Zod in front', () => {
  beforeEach(() => {
    db.transaction((tx) => seedSecuritySettings(tx));
  });

  it('is refused by the database, and the stored value does not move', () => {
    updateSecuritySettings(db, adminId, { minPasswordLength: 16 });

    const error = (() => {
      try {
        updateSecuritySettings(db, adminId, { minPasswordLength: 11 });
      } catch (caught) {
        return caught;
      }
      throw new Error('a length of 11 was accepted');
    })();

    expect(sqliteCode(error)).toBe('SQLITE_CONSTRAINT_CHECK');
    expect(getSecuritySettings(db).minPasswordLength).toBe(16);
  });

  it('is refused on a database with no settings row too, and creates no row', () => {
    db.delete(securitySettings).run();

    expect(() => updateSecuritySettings(db, adminId, { minPasswordLength: 11 })).toThrow();

    expect(rows()).toHaveLength(0);
  });

  it('rolls the whole change back when one value is refused', () => {
    expect(() =>
      updateSecuritySettings(db, adminId, { minPasswordLength: 11, sessionIdleTimeoutMinutes: 5 }),
    ).toThrow();

    expect(getSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
    expect(row()?.updatedBy).toBeNull();
  });

  it('refuses a change attributed to an account that does not exist', () => {
    expect(() =>
      updateSecuritySettings(db, 'no-such-account', { sessionIdleTimeoutMinutes: 5 }),
    ).toThrow();

    expect(getSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
  });
});

// "GET returns the persisted values after restarting the backend": a restart is a new connection
// to the same file, so this closes the database and opens the file again.
describe('persistence across a restart', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'securedesk-settings-'));
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('returns the values that were saved, from a fresh connection to the same file', () => {
    const file = path.join(directory, 'restart.sqlite');
    const before = createDb(file);
    runMigrations(before);
    const admin = insertUser(before, { login: 'ADMIN' });
    updateSecuritySettings(before, admin, CUSTOM);
    before.$client.close();

    const after = createDb(file);
    try {
      expect(getSecuritySettings(after)).toStrictEqual(CUSTOM);
    } finally {
      after.$client.close();
    }
  });
});

describe('SecuritySettingsPatch', () => {
  const valid = (patch: unknown) => SecuritySettingsPatch.safeParse(patch).success;

  it('states the limits the task sets', () => {
    expect(MAX_PASSWORD_AGE_DAYS).toBe(3650);
    expect(MAX_IDLE_TIMEOUT_MINUTES).toBe(1440);
  });

  it.each([
    [{ minPasswordLength: 12 }],
    [{ minPasswordLength: 128 }],
    [{ rejectPersonalDataInPassword: true }],
    [{ rejectPersonalDataInPassword: false }],
    [{ passwordMaxAgeDays: 1 }],
    [{ passwordMaxAgeDays: 3650 }],
    [{ passwordMaxAgeDays: null }],
    [{ sessionIdleTimeoutMinutes: 1 }],
    [{ sessionIdleTimeoutMinutes: 1440 }],
    [
      {
        minPasswordLength: 14,
        rejectPersonalDataInPassword: true,
        passwordMaxAgeDays: null,
        sessionIdleTimeoutMinutes: 10,
      },
    ],
  ])('accepts %j', (patch) => {
    expect(valid(patch)).toBe(true);
  });

  it.each([
    ['a length of 11 (below the floor)', { minPasswordLength: 11 }],
    ['a length of 0', { minPasswordLength: 0 }],
    ['a negative length', { minPasswordLength: -12 }],
    ['a length of 129', { minPasswordLength: 129 }],
    ['a fractional length', { minPasswordLength: 12.5 }],
    ['a length as text', { minPasswordLength: '12' }],
    ['a null length', { minPasswordLength: null }],
    ['an idle timeout of 0', { sessionIdleTimeoutMinutes: 0 }],
    ['a negative idle timeout', { sessionIdleTimeoutMinutes: -5 }],
    ['an idle timeout of 1441', { sessionIdleTimeoutMinutes: 1441 }],
    ['a fractional idle timeout', { sessionIdleTimeoutMinutes: 1.5 }],
    ['a null idle timeout', { sessionIdleTimeoutMinutes: null }],
    ['a maximum age of 0 days', { passwordMaxAgeDays: 0 }],
    ['a maximum age of 3651 days', { passwordMaxAgeDays: 3651 }],
    ['a fractional maximum age', { passwordMaxAgeDays: 30.5 }],
    ['a maximum age as text', { passwordMaxAgeDays: '30' }],
    ['a personal-data flag as text', { rejectPersonalDataInPassword: 'true' }],
    ['a personal-data flag as a number', { rejectPersonalDataInPassword: 1 }],
    ['a null personal-data flag', { rejectPersonalDataInPassword: null }],
    ['an unknown key', { minPasswordLength: 12, extra: 1 }],
    ['only an unknown key', { passwordHash: 'x' }],
    ['an empty object', {}],
    ['an array', []],
    ['null', null],
    ['text', 'minPasswordLength'],
    ['a valid key beside an invalid one', { sessionIdleTimeoutMinutes: 5, minPasswordLength: 11 }],
  ])('refuses %s', (_why, patch) => {
    expect(valid(patch)).toBe(false);
  });

  it('refuses Infinity and NaN, which a JSON body cannot carry but a caller of the service could', () => {
    expect(valid({ minPasswordLength: Number.POSITIVE_INFINITY })).toBe(false);
    expect(valid({ sessionIdleTimeoutMinutes: Number.NaN })).toBe(false);
  });
});
