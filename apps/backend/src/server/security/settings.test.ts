import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import type { AppDb } from '../db/connection';
import { securitySettings } from '../db/schema';
import { seedSecuritySettings } from '../db/seeds/security-settings';
import { DEFAULT_SECURITY_SETTINGS, readSecuritySettings } from './settings';

let db: AppDb;
beforeEach(() => {
  db = createMigratedDb();
});
afterEach(() => db.$client.close());

describe('readSecuritySettings', () => {
  it('returns the stored values, and only the four settings (not who changed them or when)', () => {
    db.insert(securitySettings)
      .values({
        id: 1,
        minPasswordLength: 16,
        rejectPersonalDataInPassword: true,
        passwordMaxAgeDays: 30,
        sessionIdleTimeoutMinutes: 5,
      })
      .run();

    expect(readSecuritySettings(db)).toStrictEqual({
      minPasswordLength: 16,
      rejectPersonalDataInPassword: true,
      passwordMaxAgeDays: 30,
      sessionIdleTimeoutMinutes: 5,
    });
  });

  it('sees a change at once, because nothing is cached between calls', () => {
    db.insert(securitySettings).values({ id: 1 }).run();
    expect(readSecuritySettings(db).sessionIdleTimeoutMinutes).toBe(15);

    db.update(securitySettings).set({ sessionIdleTimeoutMinutes: 5 }).run();

    expect(readSecuritySettings(db).sessionIdleTimeoutMinutes).toBe(5);
  });

  it('falls back to the defaults when the settings row is missing', () => {
    expect(db.select().from(securitySettings).all()).toHaveLength(0);

    expect(readSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
  });
});

// The fallback is only safe if it says what the database would have said. If the column
// defaults, the seed and these constants ever disagree, a missing row would silently behave
// differently from a fresh install (for example a longer idle timeout than the administrator sees).
describe('DEFAULT_SECURITY_SETTINGS', () => {
  it('equals what a bare row gets from the column defaults', () => {
    db.insert(securitySettings).values({ id: 1 }).run();

    expect(readSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
  });

  it('equals what the seed writes', () => {
    db.transaction((tx) => seedSecuritySettings(tx));

    expect(readSecuritySettings(db)).toStrictEqual(DEFAULT_SECURITY_SETTINGS);
  });

  it('states the variant-2 values: 12 characters, no personal-data rule, no expiry, 15 minutes idle', () => {
    expect(DEFAULT_SECURITY_SETTINGS).toStrictEqual({
      minPasswordLength: 12,
      rejectPersonalDataInPassword: false,
      passwordMaxAgeDays: null,
      sessionIdleTimeoutMinutes: 15,
    });
  });
});
