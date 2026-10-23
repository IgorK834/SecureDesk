import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { hashPassword } from '../../../../server/auth/password-hasher';
import { seedWorld, signInAs } from '../../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { db } from '../../../../server/db/client';
import { type AuthStage, securitySettings, sessions, users } from '../../../../server/db/schema';
import { seedSecuritySettings } from '../../../../server/db/seeds/security-settings';
import * as changePasswordRoute from '../../auth/change-password/route';
import * as loginRoute from '../../auth/login/route';
import * as meRoute from '../../auth/me/route';
import * as settingsRoute from './route';

// The security settings API end to end: real route handlers, real sessions and cookies, a real
// (in-memory) database. Two things matter and are tested separately: who may read and change the
// settings and what is refused, and that a change is then observable in the behaviour it governs
// (password rules, session expiry, password expiry), on the very next request.

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let ids: Record<string, string>;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  ids = seedWorld(db);
  db.transaction((tx) => seedSecuritySettings(tx)); // as `npm run db:seed` leaves the database
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';
const INVALID = '{"error":{"code":"VALIDATION_ERROR","message":"Nieprawidłowe dane żądania"}}';
const PASSWORD_CHANGE = '"code":"AUTH_PASSWORD_CHANGE_REQUIRED"';

const DEFAULTS = {
  minPasswordLength: 12,
  rejectPersonalDataInPassword: false,
  passwordMaxAgeDays: null,
  sessionIdleTimeoutMinutes: 15,
};

/** What a response carries: exactly the four settings, nothing about who changed them. */
const SETTINGS_KEYS = [
  'minPasswordLength',
  'passwordMaxAgeDays',
  'rejectPersonalDataInPassword',
  'sessionIdleTimeoutMinutes',
];

const asUser = (login?: string, stage: AuthStage = 'FULLY_AUTHENTICATED'): ApiClient => {
  const client = createApiClient();
  if (login) client.signIn(signInAs(db, ids[login] as string, stage));
  return client;
};

const apiGet = (c: ApiClient) => c.get(settingsRoute, '/api/admin/security-settings');
const apiPatch = (c: ApiClient, json: unknown) =>
  c.patch(settingsRoute, '/api/admin/security-settings', { json });
const apiMe = (c: ApiClient) => c.get(meRoute, '/api/auth/me');
const apiChangePassword = (c: ApiClient, newPassword: string, currentPassword = REGULAR) =>
  c.post(changePasswordRoute, '/api/auth/change-password', {
    json: { currentPassword, newPassword, confirmNewPassword: newPassword },
  });
const apiLogin = (login: string, password: string) =>
  createApiClient().post(loginRoute, '/api/auth/login', { json: { login, password } });

const body = async (response: Response) => JSON.parse(await response.text());
const storedRow = () => db.select().from(securitySettings).get();
/** Sets some settings the way the administrator would, and insists that it worked. */
async function configure(patch: Record<string, unknown>) {
  const response = await apiPatch(asUser('ADMIN'), patch);
  expect(response.status).toBe(200);
}

// ---------------------------------------------------------------------------------------------

describe('GET /api/admin/security-settings', () => {
  it('lets the Administrator read the four settings, uncacheable', async () => {
    const response = await apiGet(asUser('ADMIN'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const settings = await body(response);
    expect(Object.keys(settings).sort()).toStrictEqual(SETTINGS_KEYS);
    expect(settings).toStrictEqual(DEFAULTS);
  });

  it('reads the defaults from a database that has no settings row at all', async () => {
    db.delete(securitySettings).run();

    const response = await apiGet(asUser('ADMIN'));

    expect(await body(response)).toStrictEqual(DEFAULTS);
  });

  it('reads what is stored, at the moment of the request', async () => {
    const admin = asUser('ADMIN');
    expect(await body(await apiGet(admin))).toStrictEqual(DEFAULTS);

    db.update(securitySettings)
      .set({ minPasswordLength: 18, passwordMaxAgeDays: 60, rejectPersonalDataInPassword: true })
      .run();

    expect(await body(await apiGet(admin))).toStrictEqual({
      minPasswordLength: 18,
      rejectPersonalDataInPassword: true,
      passwordMaxAgeDays: 60,
      sessionIdleTimeoutMinutes: 15,
    });
  });

  it.each(['manager1', 'manager2', 'employee1', 'employee2', 'guest1', 'guest2'])(
    '%s receives 403 and learns nothing about the settings',
    async (login) => {
      const response = await apiGet(asUser(login));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(FORBIDDEN);
    },
  );

  it('answers an anonymous caller with 401', async () => {
    const response = await apiGet(asUser());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it('refuses an Administrator session that must still change its password', async () => {
    const response = await apiGet(asUser('ADMIN', 'INITIAL_PASSWORD_CHANGE'));

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(PASSWORD_CHANGE);
  });
});

describe('PATCH /api/admin/security-settings: what it changes', () => {
  it.each([
    ['minPasswordLength', 16],
    ['rejectPersonalDataInPassword', true],
    ['passwordMaxAgeDays', 90],
    ['sessionIdleTimeoutMinutes', 30],
  ])('changes %s, answers with all four and leaves the others alone', async (key, value) => {
    const response = await apiPatch(asUser('ADMIN'), { [key]: value });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const settings = await body(response);
    expect(Object.keys(settings).sort()).toStrictEqual(SETTINGS_KEYS);
    expect(settings).toStrictEqual({ ...DEFAULTS, [key]: value });
  });

  it('returns the persisted values on the next GET', async () => {
    const admin = asUser('ADMIN');
    const patch = {
      minPasswordLength: 20,
      rejectPersonalDataInPassword: true,
      passwordMaxAgeDays: 45,
      sessionIdleTimeoutMinutes: 5,
    };

    await apiPatch(admin, patch);

    expect(await body(await apiGet(asUser('ADMIN')))).toStrictEqual(patch);
    expect(storedRow()).toMatchObject(patch);
  });

  it('keeps what an earlier change set when a later one names other settings', async () => {
    const admin = asUser('ADMIN');
    await apiPatch(admin, { minPasswordLength: 20, sessionIdleTimeoutMinutes: 5 });

    await apiPatch(admin, { rejectPersonalDataInPassword: true });

    expect(await body(await apiGet(admin))).toStrictEqual({
      ...DEFAULTS,
      minPasswordLength: 20,
      sessionIdleTimeoutMinutes: 5,
      rejectPersonalDataInPassword: true,
    });
  });

  it('turns password expiry off again with null', async () => {
    const admin = asUser('ADMIN');
    await apiPatch(admin, { passwordMaxAgeDays: 90 });

    const response = await apiPatch(admin, { passwordMaxAgeDays: null });

    expect((await body(response)).passwordMaxAgeDays).toBeNull();
    expect(storedRow()?.passwordMaxAgeDays).toBeNull();
  });

  it('accepts the limits themselves', async () => {
    const admin = asUser('ADMIN');

    for (const patch of [
      { minPasswordLength: 12, passwordMaxAgeDays: 1, sessionIdleTimeoutMinutes: 1 },
      { minPasswordLength: 128, passwordMaxAgeDays: 3650, sessionIdleTimeoutMinutes: 1440 },
    ]) {
      expect((await apiPatch(admin, patch)).status).toBe(200);
    }
  });

  it('is repeatable: sending the same values again succeeds and changes nothing', async () => {
    const admin = asUser('ADMIN');
    await apiPatch(admin, { minPasswordLength: 16 });

    const again = await apiPatch(admin, { minPasswordLength: 16 });

    expect(again.status).toBe(200);
    expect((await body(again)).minPasswordLength).toBe(16);
  });

  it('records which administrator changed the settings, and when', async () => {
    fakeClock.set(new Date('2030-03-04T05:06:07.000Z'));

    await apiPatch(asUser('ADMIN'), { minPasswordLength: 16 });

    expect(storedRow()).toMatchObject({
      updatedBy: ids.ADMIN,
      updatedAt: new Date('2030-03-04T05:06:07.000Z'),
    });
  });

  it('works on a database that has no settings row yet, creating it', async () => {
    db.delete(securitySettings).run();

    const response = await apiPatch(asUser('ADMIN'), { sessionIdleTimeoutMinutes: 5 });

    expect(await body(response)).toStrictEqual({ ...DEFAULTS, sessionIdleTimeoutMinutes: 5 });
    expect(db.select().from(securitySettings).all()).toHaveLength(1);
  });
});

describe('PATCH /api/admin/security-settings: what it refuses', () => {
  // The refusal is the same whatever was wrong, and the settings are exactly as they were.
  const refused = async (response: Response) => {
    expect(response.status).toBe(400);
    expect(await response.text()).toBe(INVALID);
  };

  it.each([
    ['a minimum length of 11 (the floor is 12)', { minPasswordLength: 11 }],
    ['a minimum length of 0', { minPasswordLength: 0 }],
    ['a negative minimum length', { minPasswordLength: -1 }],
    ['a minimum length of 129', { minPasswordLength: 129 }],
    ['a fractional minimum length', { minPasswordLength: 12.5 }],
    ['a minimum length written as text', { minPasswordLength: '12' }],
    ['a null minimum length', { minPasswordLength: null }],
    ['an idle timeout of 0', { sessionIdleTimeoutMinutes: 0 }],
    ['a negative idle timeout', { sessionIdleTimeoutMinutes: -1 }],
    ['an idle timeout of 1441', { sessionIdleTimeoutMinutes: 1441 }],
    ['a fractional idle timeout', { sessionIdleTimeoutMinutes: 0.5 }],
    ['a maximum password age of 0', { passwordMaxAgeDays: 0 }],
    ['a maximum password age of 3651', { passwordMaxAgeDays: 3651 }],
    ['a personal-data flag written as text', { rejectPersonalDataInPassword: 'yes' }],
    ['an unknown key', { minPasswordLength: 12, somethingElse: true }],
    ['only an unknown key', { passwordPolicy: 'strict' }],
    ['an attempt to set who changed the settings', { updatedBy: 'someone-else' }],
    ['an attempt to set when they changed', { updatedAt: '2000-01-01T00:00:00.000Z' }],
    ['an attempt to name the row', { id: 2, minPasswordLength: 12 }],
    ['an empty object', {}],
    ['an array', [{ minPasswordLength: 12 }]],
    ['null', null],
    [
      'a valid setting next to an invalid one',
      { sessionIdleTimeoutMinutes: 5, minPasswordLength: 11 },
    ],
  ])('refuses %s and changes nothing', async (_why, patch) => {
    const before = storedRow();

    await refused(await apiPatch(asUser('ADMIN'), patch));

    expect(storedRow()).toStrictEqual(before);
  });

  it('refuses a body that is not JSON, and one that does not say it is', async () => {
    const admin = asUser('ADMIN');
    const before = storedRow();

    await refused(
      await admin.patch(settingsRoute, '/api/admin/security-settings', {
        body: '{"minPasswordLength": ',
        headers: { 'content-type': 'application/json' },
      }),
    );
    await refused(
      await admin.patch(settingsRoute, '/api/admin/security-settings', {
        body: 'minPasswordLength=16',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
      }),
    );
    await refused(
      await admin.patch(settingsRoute, '/api/admin/security-settings', {
        body: '{"minPasswordLength":16}',
        headers: { 'content-type': 'text/plain' },
      }),
    );
    await refused(await admin.patch(settingsRoute, '/api/admin/security-settings'));

    expect(storedRow()).toStrictEqual(before);
  });

  it.each(['manager1', 'employee1', 'guest1'])(
    '%s receives 403 and the settings do not change',
    async (login) => {
      const before = storedRow();

      const response = await apiPatch(asUser(login), { minPasswordLength: 20 });

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(FORBIDDEN);
      expect(storedRow()).toStrictEqual(before);
    },
  );

  it('answers an anonymous caller with 401 and changes nothing', async () => {
    const before = storedRow();

    const response = await apiPatch(asUser(), { minPasswordLength: 20 });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
    expect(storedRow()).toStrictEqual(before);
  });

  it('refuses an Administrator session that must still change its password', async () => {
    const before = storedRow();

    const response = await apiPatch(asUser('ADMIN', 'INITIAL_PASSWORD_CHANGE'), {
      minPasswordLength: 20,
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(PASSWORD_CHANGE);
    expect(storedRow()).toStrictEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// A change must be observable in the behaviour it governs, on the next request (SEC-23). Each
// test changes a setting through the API and then exercises the real flow it controls.
// ---------------------------------------------------------------------------------------------

const REGULAR = 'Correct horse battery staple 7!';
let regularHash: string;
beforeAll(async () => {
  regularHash = await hashPassword(REGULAR);
});

/** Gives employee1 (Katarzyna Wiśniewska) a password it can really use, last changed `ageMs` ago. */
const givePassword = (ageMs = DAY_MS) =>
  db
    .update(users)
    .set({
      passwordHash: regularHash,
      passwordChangedAt: new Date(T0.getTime() - ageMs),
      mustChangePassword: false,
    })
    .where(eq(users.id, ids.employee1 as string))
    .run();

describe('the personal-data rule (rejectPersonalDataInPassword)', () => {
  // Contains the first name, in other letter case, inside an otherwise acceptable passphrase.
  const WITH_FIRST_NAME = 'My katarzyna passphrase 2030';
  const WITH_LAST_NAME = 'Quiet WIŚNIEWSKA river 2030';
  beforeEach(() => givePassword());

  it('is off by default: a password containing the first name is accepted', async () => {
    const response = await apiChangePassword(asUser('employee1'), WITH_FIRST_NAME);

    expect(response.status).toBe(200);
  });

  it('turning it on makes a password containing the first name fail validation', async () => {
    await configure({ rejectPersonalDataInPassword: true });

    const response = await apiChangePassword(asUser('employee1'), WITH_FIRST_NAME);

    expect(response.status).toBe(400);
    const error = (await body(response)).error;
    expect(error.code).toBe('PASSWORD_POLICY_VIOLATION');
    expect(error.details.violations).toStrictEqual(['CONTAINS_FIRST_NAME']);
  });

  it('turning it on also covers the last name', async () => {
    await configure({ rejectPersonalDataInPassword: true });

    const response = await apiChangePassword(asUser('employee1'), WITH_LAST_NAME);

    expect((await body(response)).error.details.violations).toStrictEqual(['CONTAINS_LAST_NAME']);
  });

  it('turning it off again makes the same password pass the personal-data rule', async () => {
    await configure({ rejectPersonalDataInPassword: true });
    const employee = asUser('employee1');
    expect((await apiChangePassword(employee, WITH_FIRST_NAME)).status).toBe(400);

    await configure({ rejectPersonalDataInPassword: false });
    const response = await apiChangePassword(employee, WITH_FIRST_NAME);

    expect(response.status).toBe(200);
  });

  it('does not reject a password that contains no personal data, whatever the setting', async () => {
    await configure({ rejectPersonalDataInPassword: true });

    const response = await apiChangePassword(asUser('employee1'), 'A brand new passphrase 1');

    expect(response.status).toBe(200);
  });
});

describe('the minimum password length (minPasswordLength)', () => {
  const SIXTEEN = 'Quiet river blue'; // 16 characters, acceptable at the default of 12
  const TWENTY = 'Quiet river blue sky'; // 20 characters
  beforeEach(() => givePassword());

  it('accepts the 16-character password at the default minimum', async () => {
    expect(SIXTEEN).toHaveLength(16);

    const response = await apiChangePassword(asUser('employee1'), SIXTEEN);

    expect(response.status).toBe(200);
  });

  it('raising it makes the next password change enforce the new length', async () => {
    await configure({ minPasswordLength: 20 });

    const response = await apiChangePassword(asUser('employee1'), SIXTEEN);

    expect(response.status).toBe(400);
    expect((await body(response)).error.details.violations).toStrictEqual(['TOO_SHORT']);
  });

  it('accepts a password of exactly the new minimum', async () => {
    expect(TWENTY).toHaveLength(20);
    await configure({ minPasswordLength: 20 });

    const response = await apiChangePassword(asUser('employee1'), TWENTY);

    expect(response.status).toBe(200);
  });

  it('lowering it back to 12 accepts the shorter password again', async () => {
    await configure({ minPasswordLength: 20 });
    const employee = asUser('employee1');
    expect((await apiChangePassword(employee, SIXTEEN)).status).toBe(400);

    await configure({ minPasswordLength: 12 });

    expect((await apiChangePassword(employee, SIXTEEN)).status).toBe(200);
  });

  it('cannot be lowered below 12, so no password shorter than 12 is ever accepted', async () => {
    const weaken = await apiPatch(asUser('ADMIN'), { minPasswordLength: 11 });

    expect(weaken.status).toBe(400);
    const response = await apiChangePassword(asUser('employee1'), 'Eleven char');
    expect((await body(response)).error.details.violations).toContain('TOO_SHORT');
  });
});

describe('the idle timeout (sessionIdleTimeoutMinutes)', () => {
  it('lowering it expires a session that is already open, on its next request', async () => {
    const employee = asUser('employee1'); // opened at T0, idle limit 15 minutes
    fakeClock.advance(10 * MINUTE_MS);
    expect((await apiMe(employee)).status).toBe(200); // control: alive after 10 idle minutes
    fakeClock.advance(10 * MINUTE_MS); // 10 minutes idle again

    await configure({ sessionIdleTimeoutMinutes: 5 });
    const response = await apiMe(employee);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it('is enforced to the millisecond: alive just under the new limit, dead at it', async () => {
    const justUnder = asUser('employee1');
    const atLimit = asUser('guest1');
    await configure({ sessionIdleTimeoutMinutes: 5 });

    fakeClock.advance(5 * MINUTE_MS - 1);
    expect((await apiMe(justUnder)).status).toBe(200);
    fakeClock.advance(1);
    expect((await apiMe(atLimit)).status).toBe(401);
  });

  it('leaves a session that was active within the new limit alone', async () => {
    const employee = asUser('employee1');
    fakeClock.advance(10 * MINUTE_MS);
    await apiMe(employee); // activity at +10 minutes
    fakeClock.advance(2 * MINUTE_MS);

    await configure({ sessionIdleTimeoutMinutes: 5 });

    expect((await apiMe(employee)).status).toBe(200);
  });

  it('raising it keeps a session alive that the old limit would have ended', async () => {
    const employee = asUser('employee1');
    fakeClock.advance(14 * MINUTE_MS);
    await configure({ sessionIdleTimeoutMinutes: 60 }); // the administrator is active at +14

    fakeClock.advance(6 * MINUTE_MS); // employee idle for 20 minutes: dead under the old 15

    expect((await apiMe(employee)).status).toBe(200);
  });

  it('without the change that same session is dead, which is what makes the test above prove something', async () => {
    const employee = asUser('employee1');
    fakeClock.advance(20 * MINUTE_MS);

    expect((await apiMe(employee)).status).toBe(401);
  });

  it('raising it does not bring back a session that was already found expired', async () => {
    const employee = asUser('employee1');
    fakeClock.advance(10 * MINUTE_MS);
    await configure({ sessionIdleTimeoutMinutes: 5 });
    expect((await apiMe(employee)).status).toBe(401); // found expired, and ended for good

    await configure({ sessionIdleTimeoutMinutes: 60 });

    expect((await apiMe(employee)).status).toBe(401);
    const rows = db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, ids.employee1 as string))
      .all();
    expect(rows.every((s) => s.revokedAt !== null)).toBe(true);
  });

  it('applies to the administrator too: a very short limit ends their own session', async () => {
    const admin = asUser('ADMIN');
    await apiPatch(admin, { sessionIdleTimeoutMinutes: 1 });

    fakeClock.advance(MINUTE_MS);

    expect((await apiGet(admin)).status).toBe(401);
  });
});

describe('the maximum password age (passwordMaxAgeDays)', () => {
  const loginStage = async () => (await body(await apiLogin('employee1', REGULAR))).authStage;

  it('is off by default: a login with a very old password is fully authenticated', async () => {
    givePassword(1000 * DAY_MS);

    expect(await loginStage()).toBe('FULLY_AUTHENTICATED');
  });

  it('setting it makes a login with an older password a PASSWORD_EXPIRED session', async () => {
    givePassword(100 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });

    const response = await apiLogin('employee1', REGULAR);

    expect(response.status).toBe(200);
    expect((await body(response)).authStage).toBe('PASSWORD_EXPIRED');
  });

  it('that session really is limited to what an expired password may do', async () => {
    givePassword(100 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });
    const employee = createApiClient();
    await employee.post(loginRoute, '/api/auth/login', {
      json: { login: 'employee1', password: REGULAR },
    });

    expect((await body(await apiMe(employee))).authStage).toBe('PASSWORD_EXPIRED');
    expect((await apiGet(employee)).status).toBe(403);
  });

  it('a login with a password newer than the limit is fully authenticated', async () => {
    givePassword(10 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });

    expect(await loginStage()).toBe('FULLY_AUTHENTICATED');
  });

  it('counts strictly more than the limit as expired: exactly 90 days old is still fine', async () => {
    givePassword(90 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });
    expect(await loginStage()).toBe('FULLY_AUTHENTICATED');

    givePassword(90 * DAY_MS + 1);
    expect(await loginStage()).toBe('PASSWORD_EXPIRED');
  });

  it('null disables it again', async () => {
    givePassword(100 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });
    expect(await loginStage()).toBe('PASSWORD_EXPIRED');

    await configure({ passwordMaxAgeDays: null });

    expect(await loginStage()).toBe('FULLY_AUTHENTICATED');
  });

  it('raising it lets the same old password in again', async () => {
    givePassword(100 * DAY_MS);
    await configure({ passwordMaxAgeDays: 90 });
    expect(await loginStage()).toBe('PASSWORD_EXPIRED');

    await configure({ passwordMaxAgeDays: 120 });

    expect(await loginStage()).toBe('FULLY_AUTHENTICATED');
  });

  it('applies at the next login: a session that is already open keeps its stage', async () => {
    givePassword(100 * DAY_MS);
    const employee = createApiClient();
    await employee.post(loginRoute, '/api/auth/login', {
      json: { login: 'employee1', password: REGULAR },
    });

    await configure({ passwordMaxAgeDays: 1 });

    expect((await body(await apiMe(employee))).authStage).toBe('FULLY_AUTHENTICATED');
  });
});
