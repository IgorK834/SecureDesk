import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ApiClient, createApiClient } from '../../../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../../../tests/helpers/fake-clock';
import { hashPassword, verifyPassword } from '../../../../server/auth/password-hasher';
import { hashSessionToken } from '../../../../server/auth/session-service';
import {
  TEMP_PASSWORD_LENGTH,
  applyTemporaryCredential,
  issueTemporaryCredential,
} from '../../../../server/auth/temporary-password';
import { seedWorld, signInAs } from '../../../../server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../../../../server/db/__fixtures__/shared-test-db';
import { insertUser } from '../../../../server/db/__fixtures__/test-db';
import { db } from '../../../../server/db/client';
import {
  type AuthStage,
  passwordHistory,
  sessions,
  tickets,
  users,
} from '../../../../server/db/schema';
import { DEMO_TICKETS, seedTickets } from '../../../../server/db/seeds/tickets';
import { PERMISSIONS, ROLES } from '../../../../server/permissions/codes';
import { clock } from '../../../../server/time/clock';
import * as loginRoute from '../../auth/login/route';
import * as meRoute from '../../auth/me/route';
import * as ticketsRoute from '../../tickets/route';
import * as userRoute from './[id]/route';
import * as blockRoute from './[id]/block/route';
import * as unblockRoute from './[id]/unblock/route';
import * as usersRoute from './route';

// The administrator's user API end to end: real route handlers, real sessions and cookies, a real
// (in-memory) database. Who may call what, and what a response may contain, is the point of this
// file, so the expectations are written out rather than computed from the permission matrix.

const T0 = new Date('2030-01-01T00:00:00.000Z');

setUpSharedTestDb();
const fakeClock = new FakeClock(T0);
let ids: Record<string, string>;

beforeEach(() => {
  fakeClock.set(T0);
  fakeClock.install();
  ids = seedWorld(db);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  fakeClock.uninstall();
  vi.restoreAllMocks();
});

const NO_SUCH_USER = '00000000-0000-4000-8000-0000000000ff';

const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';
const NOT_FOUND = '{"error":{"code":"NOT_FOUND","message":"Nie znaleziono zasobu"}}';
const PASSWORD_CHANGE = '"code":"AUTH_PASSWORD_CHANGE_REQUIRED"';

/** The fields of an `AdminUserDto`, written out: this is the contract with the client. */
const DTO_KEYS = [
  'createdAt',
  'firstName',
  'id',
  'isBlocked',
  'lastName',
  'login',
  'mustChangePassword',
  'passwordChangedAt',
  'role',
  'temporaryPasswordExpiresAt',
  'updatedAt',
];

/** A session token per client, so a test can prove a response does not echo it. */
const tokens = new WeakMap<ApiClient, string>();

const asUser = (login?: string, stage: AuthStage = 'FULLY_AUTHENTICATED'): ApiClient => {
  const client = createApiClient();
  if (login) {
    const token = signInAs(db, ids[login] as string, stage);
    tokens.set(client, token);
    client.signIn(token);
  }
  return client;
};

const apiList = (c: ApiClient, query = '') => c.get(usersRoute, `/api/admin/users${query}`);
const apiGet = (c: ApiClient, id: string) =>
  c.get(userRoute, `/api/admin/users/${id}`, { params: { id } });

const apiCreate = (c: ApiClient, json: unknown) => c.post(usersRoute, '/api/admin/users', { json });
const apiPatch = (c: ApiClient, id: string, json: unknown) =>
  c.patch(userRoute, `/api/admin/users/${id}`, { params: { id }, json });
const apiDelete = (c: ApiClient, id: string) =>
  c.delete(userRoute, `/api/admin/users/${id}`, { params: { id } });
const apiBlock = (c: ApiClient, id: string) =>
  c.post(blockRoute, `/api/admin/users/${id}/block`, { params: { id } });
const apiUnblock = (c: ApiClient, id: string) =>
  c.post(unblockRoute, `/api/admin/users/${id}/unblock`, { params: { id } });
const apiMe = (c: ApiClient) => c.get(meRoute, '/api/auth/me');
const apiLogin = (login: string, password: string) =>
  createApiClient().post(loginRoute, '/api/auth/login', { json: { login, password } });

const body = async (response: Response) => JSON.parse(await response.text());
const logins = (result: { items: { login: string }[] }) => result.items.map((u) => u.login);
const userRow = (id: string) => db.select().from(users).where(eq(users.id, id)).get();
const sessionRows = (userId: string) =>
  db.select().from(sessions).where(eq(sessions.userId, userId)).all();

describe('GET /api/admin/users: who may call it', () => {
  it('lets the Administrator list every account, with the documented envelope', async () => {
    const response = await apiList(asUser('ADMIN'));
    const result = await body(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(result).toMatchObject({ page: 1, pageSize: 20, total: 7 });
    expect(logins(result)).toStrictEqual([
      'ADMIN',
      'employee1',
      'employee2',
      'guest1',
      'guest2',
      'manager1',
      'manager2',
    ]);
  });

  it.each(['manager1', 'manager2', 'employee1', 'employee2', 'guest1', 'guest2'])(
    '%s receives 403 and learns nothing about the accounts',
    async (login) => {
      const response = await apiList(asUser(login));

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(FORBIDDEN);
    },
  );

  it('answers an anonymous caller with 401', async () => {
    const response = await apiList(asUser());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it.each<AuthStage>(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'])(
    'refuses even the Administrator while the session is in the %s stage',
    async (stage) => {
      const response = await apiList(asUser('ADMIN', stage));

      expect(response.status).toBe(403);
      expect(await response.text()).toContain(PASSWORD_CHANGE);
    },
  );
});

describe('GET /api/admin/users/[id]: who may call it', () => {
  it('lets the Administrator read an account', async () => {
    const response = await apiGet(asUser('ADMIN'), ids.employee1 as string);
    const result = await body(response);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(result).toMatchObject({
      id: ids.employee1,
      login: 'employee1',
      role: 'EMPLOYEE',
      isBlocked: false,
      mustChangePassword: false,
    });
  });

  it.each(['manager1', 'employee1', 'guest1'])('%s receives 403', async (login) => {
    const response = await apiGet(asUser(login), ids.employee2 as string);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe(FORBIDDEN);
  });

  it('answers an anonymous caller with 401', async () => {
    const response = await apiGet(asUser(), ids.employee1 as string);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it('refuses a session that must still change its password', async () => {
    const response = await apiGet(
      asUser('ADMIN', 'INITIAL_PASSWORD_CHANGE'),
      ids.employee1 as string,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(PASSWORD_CHANGE);
  });

  it('answers an unknown id with 404, and a malformed one with 400 before any lookup', async () => {
    const admin = asUser('ADMIN');

    const unknown = await apiGet(admin, NO_SUCH_USER);
    const malformed = await apiGet(admin, "1'; DROP TABLE users; --");

    expect(unknown.status).toBe(404);
    expect(await unknown.text()).toBe(NOT_FOUND);
    expect(malformed.status).toBe(400);
  });
});

describe('what the responses contain', () => {
  // Seeded accounts have a placeholder hash. Give them realistic secrets so that a leak could not
  // hide behind the placeholder: an Argon2 string, and a live session whose token we know.
  const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNo';

  /** Every key and every string value anywhere in the document. */
  const walk = (
    value: unknown,
    found: { keys: string[]; strings: string[] } = { keys: [], strings: [] },
  ) => {
    if (typeof value === 'string') found.strings.push(value);
    else if (Array.isArray(value)) value.forEach((item) => walk(item, found));
    else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        found.keys.push(key);
        walk(item, found);
      }
    }
    return found;
  };

  const expectNoCredentialData = (text: string, client: ApiClient) => {
    const token = tokens.get(client) as string;
    const { keys, strings } = walk(JSON.parse(text));

    // The names the backlog forbids as keys or values: password, hash, token. The two fields that
    // describe the password's *state* are the documented exception; they hold a boolean and a date.
    const stateFields = ['mustChangePassword', 'temporaryPasswordExpiresAt', 'passwordChangedAt'];
    const keysWithoutState = keys.filter((key) => !stateFields.includes(key));
    expect(keysWithoutState.join(' ')).not.toMatch(/password|hash|token/i);
    expect(strings.join(' ')).not.toMatch(/password|hash|token|argon2/i);

    // And the actual secrets, in any form.
    expect(text).not.toContain(HASH);
    expect(text).not.toContain(token);
    expect(text).not.toContain(hashSessionToken(token));
  };

  beforeEach(() => {
    db.update(users).set({ passwordHash: HASH }).run();
  });

  it('list: no hash, no token, only the allowlisted fields on every item', async () => {
    const admin = asUser('ADMIN');
    asUser('employee1'); // other live sessions exist too
    const response = await apiList(admin);
    const text = await response.text();

    expectNoCredentialData(text, admin);
    for (const item of JSON.parse(text).items) {
      expect(Object.keys(item).sort()).toStrictEqual(DTO_KEYS);
    }
  });

  it('detail: no hash, no token, only the allowlisted fields', async () => {
    const admin = asUser('ADMIN');
    const response = await apiGet(admin, ids.guest1 as string);
    const text = await response.text();

    expectNoCredentialData(text, admin);
    expect(Object.keys(JSON.parse(text)).sort()).toStrictEqual(DTO_KEYS);
  });

  it('shows the password state: a pending account has its deadline, an active one a change date', async () => {
    const issued = new Date('2030-01-01T00:00:00.000Z');
    const expires = new Date(issued.getTime() + 12 * 60 * 60 * 1000);
    const changed = new Date('2029-12-24T10:00:00.000Z');
    db.update(users)
      .set({ mustChangePassword: true, temporaryPasswordExpiresAt: expires })
      .where(eq(users.id, ids.guest1 as string))
      .run();
    db.update(users)
      .set({ passwordChangedAt: changed })
      .where(eq(users.id, ids.guest2 as string))
      .run();
    const admin = asUser('ADMIN');

    const pending = await body(await apiGet(admin, ids.guest1 as string));
    const active = await body(await apiGet(admin, ids.guest2 as string));

    expect(pending).toMatchObject({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expires.toISOString(),
      passwordChangedAt: null,
    });
    expect(active).toMatchObject({
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      passwordChangedAt: changed.toISOString(),
    });
  });
});

describe('GET /api/admin/users: query', () => {
  // Accounts whose names contain the characters LIKE treats specially, next to look-alikes.
  beforeEach(() => {
    insertUser(db, { login: 'pct-lit', firstName: '100%', lastName: 'Sale' });
    insertUser(db, { login: 'pct-lure', firstName: '100x', lastName: 'Sale' });
    insertUser(db, { login: 'us_lit', firstName: 'Una', lastName: 'Nine' });
    insertUser(db, { login: 'usxlit', firstName: 'Una', lastName: 'Nine' });
  });

  it('q=% matches only the literal percent sign (the request carries %25)', async () => {
    const result = await body(await apiList(asUser('ADMIN'), '?q=%25'));

    expect(logins(result)).toStrictEqual(['pct-lit']);
    expect(result.total).toBe(1);
  });

  it('q=_ matches only the literal underscore', async () => {
    const result = await body(await apiList(asUser('ADMIN'), '?q=_'));

    expect(logins(result)).toStrictEqual(['us_lit']);
  });

  it('q=\\ matches only a literal backslash, and finds none here', async () => {
    const result = await body(await apiList(asUser('ADMIN'), '?q=%5C'));

    expect(result).toMatchObject({ items: [], total: 0 });
  });

  it('searches the login, first name and last name', async () => {
    const admin = asUser('ADMIN');

    expect(logins(await body(await apiList(admin, '?q=manager')))).toStrictEqual([
      'manager1',
      'manager2',
    ]);
    const someone = db
      .select()
      .from(users)
      .where(eq(users.id, ids.employee1 as string))
      .get();
    expect(logins(await body(await apiList(admin, `?q=${someone?.firstName}`)))).toContain(
      'employee1',
    );
    expect(logins(await body(await apiList(admin, `?q=${someone?.lastName}`)))).toContain(
      'employee1',
    );
  });

  it('filters by role', async () => {
    const result = await body(await apiList(asUser('ADMIN'), '?role=GUEST'));

    expect(logins(result)).toStrictEqual(['guest1', 'guest2']);
  });

  it('pages: page and pageSize select a slice, total stays the size of the whole match', async () => {
    const admin = asUser('ADMIN');
    const first = await body(await apiList(admin, '?pageSize=3&page=1'));
    const third = await body(await apiList(admin, '?pageSize=3&page=3'));

    expect(first).toMatchObject({ page: 1, pageSize: 3, total: 11 });
    expect(first.items).toHaveLength(3);
    expect(third).toMatchObject({ page: 3, pageSize: 3, total: 11 });
    expect(third.items).toHaveLength(3);
    expect(logins(first)).not.toContain(logins(third)[0]);
  });

  it('accepts the largest page size, and refuses one larger instead of returning everything', async () => {
    const admin = asUser('ADMIN');

    const largest = await apiList(admin, '?pageSize=100');
    const tooLarge = await apiList(admin, '?pageSize=1000');

    expect(largest.status).toBe(200);
    expect(tooLarge.status).toBe(400);
    expect(JSON.parse(await tooLarge.text()).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an unknown field', '?sort=login'],
    ['an unknown status', '?status=deleted'],
    ['an unknown role', '?role=ROOT'],
    ['page 0', '?page=0'],
    ['a negative page', '?page=-1'],
    ['a fractional page', '?page=1.5'],
    ['pageSize 0', '?pageSize=0'],
    ['a non-numeric page', '?page=abc'],
    ['search text beyond any possible match', `?q=${'a'.repeat(65)}`],
  ])('refuses %s with 400', async (_name, query) => {
    const response = await apiList(asUser('ADMIN'), query);

    expect(response.status).toBe(400);
  });

  it('returns each status as its own subset', async () => {
    db.update(users)
      .set({ isBlocked: true })
      .where(eq(users.id, ids.guest1 as string))
      .run();
    db.update(users)
      .set({ isBlocked: true, mustChangePassword: true })
      .where(eq(users.id, ids.guest2 as string))
      .run();
    db.update(users)
      .set({ mustChangePassword: true })
      .where(eq(users.id, ids.manager1 as string))
      .run();
    const admin = asUser('ADMIN');
    const status = async (value: string) =>
      logins(await body(await apiList(admin, `?status=${value}&pageSize=100`)));

    expect(await status('blocked')).toStrictEqual(['guest1', 'guest2']);
    expect(await status('pending')).toStrictEqual(['manager1']);
    expect(await status('active')).toStrictEqual([
      'ADMIN',
      'employee1',
      'employee2',
      'manager2',
      'pct-lit',
      'pct-lure',
      'us_lit',
      'usxlit',
    ]);
  });
});

describe('soft-deleted accounts', () => {
  beforeEach(() => {
    db.update(users)
      .set({ deletedAt: T0 })
      .where(eq(users.id, ids.employee2 as string))
      .run();
  });

  it('are absent from the list and from its total', async () => {
    const result = await body(await apiList(asUser('ADMIN')));

    expect(logins(result)).not.toContain('employee2');
    expect(result.total).toBe(6);
  });

  it('are absent from a search that names them exactly', async () => {
    const result = await body(await apiList(asUser('ADMIN'), '?q=employee2'));

    expect(result).toMatchObject({ items: [], total: 0 });
  });

  it('answer the detail endpoint like an account that never existed', async () => {
    const deleted = await apiGet(asUser('ADMIN'), ids.employee2 as string);
    const unknown = await apiGet(asUser('ADMIN'), NO_SUCH_USER);

    expect(deleted.status).toBe(404);
    expect(await deleted.text()).toBe(await unknown.text());
  });
});

// Keeps the role ids in step with the codes the API speaks.
describe('role codes', () => {
  it('are the upper-case role ids', async () => {
    const result = await body(await apiList(asUser('ADMIN')));
    const roles = new Set(result.items.map((u: { role: string }) => u.role));

    expect([...roles].sort()).toStrictEqual(
      Object.values(ROLES)
        .map((id) => id.toUpperCase())
        .sort(),
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Creating accounts (SD-17)
// ---------------------------------------------------------------------------------------------

const NEW_USER = { login: 'newbie', firstName: 'Nowy', lastName: 'Użytkownik', role: 'EMPLOYEE' };
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const PROTECTED = 'PROTECTED_ACCOUNT';

const userCount = () => db.select().from(users).all().length;
const errorCode = async (response: Response) => (await body(response)).error.code;

describe('POST /api/admin/users: what is created', () => {
  it('answers 201 no-store with the account and the one-time password, and nothing else', async () => {
    const response = await apiCreate(asUser('ADMIN'), NEW_USER);
    const created = await body(response);

    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(Object.keys(created).sort()).toStrictEqual(['temporaryPassword', 'user']);
    expect(Object.keys(created.user).sort()).toStrictEqual(DTO_KEYS);
    expect(Object.keys(created.temporaryPassword).sort()).toStrictEqual(['expiresAt', 'value']);
    expect(created.user).toMatchObject({
      login: 'newbie',
      firstName: 'Nowy',
      lastName: 'Użytkownik',
      role: 'EMPLOYEE',
      isBlocked: false,
      mustChangePassword: true,
      passwordChangedAt: null,
    });
  });

  it('issues a 16-character password with letters, digits and specials, valid for 12 hours', async () => {
    const { user, temporaryPassword } = await body(await apiCreate(asUser('ADMIN'), NEW_USER));

    expect(temporaryPassword.value).toHaveLength(TEMP_PASSWORD_LENGTH);
    expect(temporaryPassword.value).toMatch(/[A-Za-z]/);
    expect(temporaryPassword.value).toMatch(/[0-9]/);
    expect(temporaryPassword.value).toMatch(/[^A-Za-z0-9]/);
    expect(temporaryPassword.expiresAt).toBe(
      new Date(T0.getTime() + TWELVE_HOURS_MS).toISOString(),
    );
    expect(user.temporaryPasswordExpiresAt).toBe(temporaryPassword.expiresAt);
  });

  it.each(['MANAGER', 'EMPLOYEE', 'GUEST'])('creates a %s with that role', async (role) => {
    const { user } = await body(await apiCreate(asUser('ADMIN'), { ...NEW_USER, role }));

    expect(user.role).toBe(role);
    expect(userRow(user.id)?.roleId).toBe(role.toLowerCase());
  });

  it('stores only an Argon2id hash of that password, never the password', async () => {
    const { user, temporaryPassword } = await body(await apiCreate(asUser('ADMIN'), NEW_USER));
    const row = userRow(user.id);

    expect(row).toMatchObject({
      login: 'newbie',
      loginNormalized: 'newbie',
      mustChangePassword: true,
      isBlocked: false,
      deletedAt: null,
      passwordChangedAt: null,
      temporaryPasswordExpiresAt: new Date(T0.getTime() + TWELVE_HOURS_MS),
    });
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(row?.passwordHash as string, temporaryPassword.value)).toBe(true);
    // The plaintext is in no column of any table.
    for (const table of ['users', 'sessions', 'password_history', 'tickets']) {
      const dump = JSON.stringify(db.all(sql.raw(`SELECT * FROM ${table}`)));
      expect(dump).not.toContain(temporaryPassword.value);
    }
  });

  it('never shows the password again: not in the detail, not in the list', async () => {
    const admin = asUser('ADMIN');
    const { user, temporaryPassword } = await body(await apiCreate(admin, NEW_USER));

    const detail = await (await apiGet(admin, user.id)).text();
    const list = await (await apiList(admin)).text();

    expect(detail).not.toContain(temporaryPassword.value);
    expect(list).not.toContain(temporaryPassword.value);
  });

  it('gives every account its own password', async () => {
    const admin = asUser('ADMIN');
    const first = await body(await apiCreate(admin, NEW_USER));
    const second = await body(await apiCreate(admin, { ...NEW_USER, login: 'newbie2' }));

    expect(first.temporaryPassword.value).not.toBe(second.temporaryPassword.value);
    expect(userRow(first.user.id)?.passwordHash).not.toBe(userRow(second.user.id)?.passwordHash);
  });

  it('can be used to sign in, and then requires the first password change', async () => {
    const { temporaryPassword } = await body(await apiCreate(asUser('ADMIN'), NEW_USER));

    const response = await apiLogin('newbie', temporaryPassword.value);

    expect(response.status).toBe(200);
    expect(await body(response)).toMatchObject({
      authStage: 'INITIAL_PASSWORD_CHANGE',
      mustChangePassword: true,
    });
  });

  it('trims the text fields and keeps the spelling of the login as typed', async () => {
    const response = await apiCreate(asUser('ADMIN'), {
      login: '  New.User-1  ',
      firstName: '  Jan ',
      lastName: ' Kowalski  ',
      role: 'GUEST',
    });
    const { user } = await body(response);

    expect(response.status).toBe(201);
    expect(user).toMatchObject({ login: 'New.User-1', firstName: 'Jan', lastName: 'Kowalski' });
    expect(userRow(user.id)?.loginNormalized).toBe('new.user-1');
  });

  it('stores names as plain text exactly as sent, leaving escaping to the page that shows them', async () => {
    const markup = { ...NEW_USER, firstName: '<b>Jan</b>', lastName: "O'Brien & Sons" };

    const { user } = await body(await apiCreate(asUser('ADMIN'), markup));

    expect(user).toMatchObject({ firstName: '<b>Jan</b>', lastName: "O'Brien & Sons" });
  });
});

describe('POST /api/admin/users: what is refused', () => {
  it.each([
    ['Administrator', { role: 'ADMINISTRATOR' }],
    ['ROOT', { role: 'ROOT' }],
    ['a lower-case role', { role: 'employee' }],
    ['a missing role', { role: undefined }],
    ['a login that is too short', { login: 'ab' }],
    ['a login that is too long', { login: 'a'.repeat(33) }],
    ['a login with a space', { login: 'new user' }],
    ['a login with a non-ASCII letter', { login: 'żółw' }],
    // Would normalize to "employee1": only the ASCII-only pattern keeps it from the unique index.
    ['a full-width spelling of an existing login', { login: 'ＥＭＰＬＯＹＥＥ１' }],
    ['a login with markup', { login: '<script>' }],
    ['an empty login', { login: '' }],
    ['a blank first name', { firstName: '   ' }],
    ['a first name that is too long', { firstName: 'x'.repeat(65) }],
    ['a blank last name', { lastName: '' }],
    ['a last name that is too long', { lastName: 'x'.repeat(65) }],
    ['a number as a name', { firstName: 7 }],
  ])('rejects %s with 400 and creates nothing', async (_name, patch) => {
    const before = userCount();

    const response = await apiCreate(asUser('ADMIN'), { ...NEW_USER, ...patch });

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    expect(userCount()).toBe(before);
  });

  it.each([
    ['isBlocked', { isBlocked: true }],
    ['mustChangePassword', { mustChangePassword: false }],
    ['passwordHash', { passwordHash: 'x' }],
    ['password', { password: 'ChosenByTheCaller1!' }],
    ['roleId', { roleId: 'administrator' }],
    ['deletedAt', { deletedAt: 1 }],
    ['id', { id: NO_SUCH_USER }],
  ])(
    'rejects an unknown field (%s) instead of ignoring it, and creates nothing',
    async (_name, extra) => {
      const before = userCount();

      const response = await apiCreate(asUser('ADMIN'), { ...NEW_USER, ...extra });

      expect(response.status).toBe(400);
      expect(userCount()).toBe(before);
    },
  );

  it.each([
    ['the same spelling', 'employee1'],
    ['another case', 'Employee1'],
    ['upper case', 'EMPLOYEE1'],
    ['the permanent ADMIN login', 'admin'],
  ])('refuses a login that exists (%s) with 409 LOGIN_ALREADY_EXISTS', async (_name, login) => {
    const before = userRow(ids.employee1 as string);
    const count = userCount();

    const response = await apiCreate(asUser('ADMIN'), { ...NEW_USER, login });

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('LOGIN_ALREADY_EXISTS');
    expect(userCount()).toBe(count);
    expect(userRow(ids.employee1 as string)).toStrictEqual(before);
  });

  it('does not reveal the password of the refused attempt: a conflict carries no credential', async () => {
    const response = await apiCreate(asUser('ADMIN'), { ...NEW_USER, login: 'Employee1' });

    expect(Object.keys(await body(response))).toStrictEqual(['error']);
  });

  it('answers a database failure that is not a duplicate with a generic 500, not a 409', async () => {
    // A real driver failure that `mapDbError` does not translate (it is neither a unique nor a
    // foreign-key violation). Each test has its own in-memory database, so this trigger is gone
    // with it.
    db.run(sql`CREATE TRIGGER fail_user_insert BEFORE INSERT ON users
      BEGIN SELECT RAISE(ABORT, 'disk-full-simulation'); END`);

    const response = await apiCreate(asUser('ADMIN'), NEW_USER);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text).error.code).toBe('INTERNAL_ERROR');
    expect(text).not.toMatch(/disk-full|SQLITE|trigger|users/i);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await asUser('ADMIN').post(usersRoute, '/api/admin/users', {
      body: '{"login":',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/admin/users: who may call it', () => {
  it.each(['manager1', 'employee1', 'guest1'])(
    '%s receives 403 and nothing is created',
    async (login) => {
      const count = userCount();

      const response = await apiCreate(asUser(login), NEW_USER);

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(FORBIDDEN);
      expect(userCount()).toBe(count);
    },
  );

  it('answers an anonymous caller with 401', async () => {
    const response = await apiCreate(asUser(), NEW_USER);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it('refuses an Administrator session that must still change its password', async () => {
    const response = await apiCreate(asUser('ADMIN', 'INITIAL_PASSWORD_CHANGE'), NEW_USER);

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(PASSWORD_CHANGE);
  });
});

// ---------------------------------------------------------------------------------------------
// Editing accounts (SD-17)
// ---------------------------------------------------------------------------------------------

describe('PATCH /api/admin/users/[id]: what may change', () => {
  it('changes the name and the role, and returns the updated account', async () => {
    fakeClock.set(new Date(T0.getTime() + 60_000));

    const response = await apiPatch(asUser('ADMIN'), ids.employee1 as string, {
      firstName: 'Zofia',
      lastName: 'Nowacka',
      role: 'MANAGER',
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await body(response)).toMatchObject({
      id: ids.employee1,
      login: 'employee1',
      firstName: 'Zofia',
      lastName: 'Nowacka',
      role: 'MANAGER',
      updatedAt: new Date(T0.getTime() + 60_000).toISOString(),
    });
  });

  it.each([
    ['only the first name', { firstName: 'Zofia' }],
    ['only the last name', { lastName: 'Nowacka' }],
    ['only the role', { role: 'GUEST' }],
  ])('changes %s and no other column', async (_name, changes) => {
    const id = ids.employee1 as string;
    const before = userRow(id);
    fakeClock.set(new Date(T0.getTime() + 60_000));

    await apiPatch(asUser('ADMIN'), id, changes);

    const after = userRow(id);
    const expected = {
      ...before,
      ...('firstName' in changes && { firstName: changes.firstName }),
      ...('lastName' in changes && { lastName: changes.lastName }),
      ...('role' in changes && { roleId: changes.role?.toLowerCase() }),
      updatedAt: new Date(T0.getTime() + 60_000),
    };
    expect(after).toStrictEqual(expected);
  });

  it('keeps the password, its history and the account sessions as they were', async () => {
    const id = ids.employee1 as string;
    db.insert(passwordHistory).values({ userId: id, passwordHash: 'older-hash' }).run();
    asUser('employee1');
    asUser('employee1');
    const history = db.select().from(passwordHistory).all();
    const liveSessions = sessionRows(id);
    const { passwordHash, mustChangePassword, passwordChangedAt } = userRow(id) as {
      passwordHash: string;
      mustChangePassword: boolean;
      passwordChangedAt: Date | null;
    };

    const response = await apiPatch(asUser('ADMIN'), id, { firstName: 'Zofia', role: 'GUEST' });

    expect(response.status).toBe(200);
    expect(userRow(id)).toMatchObject({ passwordHash, mustChangePassword, passwordChangedAt });
    expect(db.select().from(passwordHistory).all()).toStrictEqual(history);
    expect(sessionRows(id)).toStrictEqual(liveSessions);
    expect(liveSessions).toHaveLength(2);
    expect(liveSessions.every((s) => s.revokedAt === null)).toBe(true);
  });

  it('does not touch any other account', async () => {
    const others = db
      .select()
      .from(users)
      .all()
      .filter((u) => u.id !== ids.employee1);

    await apiPatch(asUser('ADMIN'), ids.employee1 as string, { firstName: 'Zofia' });

    expect(
      db
        .select()
        .from(users)
        .all()
        .filter((u) => u.id !== ids.employee1),
    ).toStrictEqual(others);
  });

  it('takes effect on the very next request of the person concerned', async () => {
    const employee = asUser('employee1');
    const before = await body(await apiMe(employee));

    await apiPatch(asUser('ADMIN'), ids.employee1 as string, { role: 'MANAGER' });
    const after = await body(await apiMe(employee));

    expect(before.user.role).toBe('EMPLOYEE');
    expect(before.permissions).not.toContain(PERMISSIONS.TICKETS_READ_ALL);
    expect(after.user.role).toBe('MANAGER');
    expect(after.permissions).toContain(PERMISSIONS.TICKETS_READ_ALL);
  });

  it('may rename the permanent ADMIN account holder (names are not protected)', async () => {
    const response = await apiPatch(asUser('ADMIN'), ids.ADMIN as string, { firstName: 'Główny' });

    expect(response.status).toBe(200);
    expect(userRow(ids.ADMIN as string)).toMatchObject({
      firstName: 'Główny',
      roleId: ROLES.ADMINISTRATOR,
    });
  });
});

describe('PATCH /api/admin/users/[id]: what is refused (SEC-28)', () => {
  it.each([
    ['role_id', { role_id: 'x' }],
    ['roleId', { roleId: 'administrator' }],
    ['isBlocked', { isBlocked: true }],
    ['is_blocked', { is_blocked: 1 }],
    ['passwordHash', { passwordHash: 'x' }],
    ['password_hash', { password_hash: 'x' }],
    ['password', { password: 'x' }],
    ['mustChangePassword', { mustChangePassword: false }],
    ['login', { login: 'new' }],
    ['loginNormalized', { loginNormalized: 'new' }],
    ['deletedAt', { deletedAt: 1 }],
    ['id', { id: NO_SUCH_USER }],
    ['createdAt', { createdAt: 1 }],
    ['an unknown key', { nickname: 'x' }],
    ['a forbidden key next to a valid one', { firstName: 'Zofia', isBlocked: true }],
  ])('rejects %s with 400 and leaves the row unchanged', async (_name, json) => {
    const id = ids.employee1 as string;
    const before = userRow(id);

    const response = await apiPatch(asUser('ADMIN'), id, json);

    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    expect(userRow(id)).toStrictEqual(before);
  });

  it.each([
    ['an empty body', {}],
    ['a blank first name', { firstName: '  ' }],
    ['a last name that is too long', { lastName: 'x'.repeat(65) }],
    ['an unknown role', { role: 'ROOT' }],
    ['a lower-case role', { role: 'guest' }],
    ['a null name', { firstName: null }],
  ])('rejects %s with 400 and leaves the row unchanged', async (_name, json) => {
    const id = ids.employee1 as string;
    const before = userRow(id);

    const response = await apiPatch(asUser('ADMIN'), id, json);

    expect(response.status).toBe(400);
    expect(userRow(id)).toStrictEqual(before);
  });
});

describe('PATCH /api/admin/users/[id]: the permanent ADMIN account (SEC-29)', () => {
  it.each(['EMPLOYEE', 'MANAGER', 'GUEST', 'ADMINISTRATOR'])(
    'answers a request to change ADMIN to %s with 409 PROTECTED_ACCOUNT and changes nothing',
    async (role) => {
      const id = ids.ADMIN as string;
      const before = userRow(id);

      const response = await apiPatch(asUser('ADMIN'), id, { role });

      expect(response.status).toBe(409);
      expect(await errorCode(response)).toBe(PROTECTED);
      expect(userRow(id)).toStrictEqual(before);
    },
  );

  it('does not let a name edit smuggle in a role change on ADMIN', async () => {
    const id = ids.ADMIN as string;
    const before = userRow(id);

    const response = await apiPatch(asUser('ADMIN'), id, { firstName: 'Ktoś', role: 'GUEST' });

    expect(response.status).toBe(409);
    expect(userRow(id)).toStrictEqual(before); // not even the name was applied
  });

  it('refuses to hand the Administrator role to anyone else', async () => {
    const id = ids.employee1 as string;
    const before = userRow(id);

    const response = await apiPatch(asUser('ADMIN'), id, { role: 'ADMINISTRATOR' });

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe(PROTECTED);
    expect(userRow(id)).toStrictEqual(before);
  });
});

describe('PATCH /api/admin/users/[id]: who may call it, and on whom', () => {
  it.each(['manager1', 'employee1', 'guest1'])(
    '%s receives 403 and the row is unchanged',
    async (login) => {
      const id = ids.employee2 as string;
      const before = userRow(id);

      const response = await apiPatch(asUser(login), id, { firstName: 'Zofia' });

      expect(response.status).toBe(403);
      expect(await response.text()).toBe(FORBIDDEN);
      expect(userRow(id)).toStrictEqual(before);
    },
  );

  it('answers an anonymous caller with 401', async () => {
    const response = await apiPatch(asUser(), ids.employee2 as string, { firstName: 'Zofia' });

    expect(response.status).toBe(401);
  });

  it('refuses an Administrator session that must still change its password', async () => {
    const response = await apiPatch(asUser('ADMIN', 'PASSWORD_EXPIRED'), ids.employee2 as string, {
      firstName: 'Zofia',
    });

    expect(response.status).toBe(403);
    expect(await response.text()).toContain(PASSWORD_CHANGE);
  });

  it('answers an unknown account with 404, a malformed id with 400, and a deleted account with 404', async () => {
    const admin = asUser('ADMIN');
    db.update(users)
      .set({ deletedAt: T0 })
      .where(eq(users.id, ids.guest2 as string))
      .run();

    expect((await apiPatch(admin, NO_SUCH_USER, { firstName: 'Zofia' })).status).toBe(404);
    expect((await apiPatch(admin, 'nope', { firstName: 'Zofia' })).status).toBe(400);
    const deleted = await apiPatch(admin, ids.guest2 as string, { firstName: 'Zofia' });
    expect(deleted.status).toBe(404);
    expect(userRow(ids.guest2 as string)?.firstName).not.toBe('Zofia');
  });

  it('validates the id before the body: a bad id with a bad body is still one clear refusal', async () => {
    const response = await apiPatch(asUser('ADMIN'), 'nope', { isBlocked: true });

    expect(response.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// Blocking, unblocking and deleting accounts (SD-18)
// ---------------------------------------------------------------------------------------------

const PASSWORD = 'Correct horse battery staple 7!';
const GENERIC_401 =
  '{"error":{"code":"AUTH_INVALID_CREDENTIALS","message":"Login lub hasło niepoprawne"}}';
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

/** Gives an account a password it can really sign in with (the seed accounts cannot). */
const givePassword = (login: string) =>
  db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, ids[login] as string))
    .run();

const sessionsAreRevoked = (userId: string) => {
  const rows = sessionRows(userId);
  return rows.length > 0 && rows.every((s) => s.revokedAt !== null);
};

describe('POST /api/admin/users/[id]/block (SEC-18)', () => {
  beforeEach(() => givePassword('employee1'));

  it('ends every live session at once: the next request of each one is a 401', async () => {
    const laptop = asUser('employee1');
    const phone = asUser('employee1');
    expect((await apiMe(laptop)).status).toBe(200);
    expect((await apiMe(phone)).status).toBe(200);

    const response = await apiBlock(asUser('ADMIN'), ids.employee1 as string);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await body(response)).toMatchObject({ id: ids.employee1, isBlocked: true });
    // Looked at before any request touches them: a request would revoke them lazily, which would
    // hide a block that forgot to.
    expect(sessionsAreRevoked(ids.employee1 as string)).toBe(true);
    expect((await apiMe(laptop)).status).toBe(401);
    expect((await apiMe(phone)).status).toBe(401);
  });

  it('closes the door to a new login with the same generic answer as a wrong password', async () => {
    const wrongPassword = await apiLogin('employee1', 'not the password');
    expect((await apiLogin('employee1', PASSWORD)).status).toBe(200);

    await apiBlock(asUser('ADMIN'), ids.employee1 as string);
    const blocked = await apiLogin('employee1', PASSWORD);

    expect(blocked.status).toBe(401);
    expect(await blocked.text()).toBe(GENERIC_401);
    expect(await wrongPassword.text()).toBe(GENERIC_401);
    expect((await apiLogin('nobody', PASSWORD)).status).toBe(401);
  });

  it('leaves every other account, and its sessions, alone', async () => {
    const bystander = asUser('employee2');
    const before = userRow(ids.employee2 as string);

    await apiBlock(asUser('ADMIN'), ids.employee1 as string);

    expect((await apiMe(bystander)).status).toBe(200);
    expect(userRow(ids.employee2 as string)).toStrictEqual(before);
    expect(sessionRows(ids.employee2 as string).every((s) => s.revokedAt === null)).toBe(true);
  });

  it('is idempotent: blocking again succeeds and ends in the same state', async () => {
    const admin = asUser('ADMIN');

    const first = await apiBlock(admin, ids.employee1 as string);
    const second = await apiBlock(admin, ids.employee1 as string);

    expect([first.status, second.status]).toStrictEqual([200, 200]);
    expect((await body(second)).isBlocked).toBe(true);
    expect(
      sessionsAreRevoked(ids.employee1 as string) ||
        sessionRows(ids.employee1 as string).length === 0,
    ).toBe(true);
  });

  it('ends a session opened after the first block was set, if the account is somehow still signed in', async () => {
    const admin = asUser('ADMIN');
    await apiBlock(admin, ids.employee1 as string);
    const late = asUser('employee1'); // a session that slipped in, e.g. created by another process

    await apiBlock(admin, ids.employee1 as string);

    expect((await apiMe(late)).status).toBe(401);
  });

  it('refuses a deleted account with 404, like any other missing one', async () => {
    db.update(users)
      .set({ deletedAt: T0 })
      .where(eq(users.id, ids.employee1 as string))
      .run();

    expect((await apiBlock(asUser('ADMIN'), ids.employee1 as string)).status).toBe(404);
    expect((await apiBlock(asUser('ADMIN'), NO_SUCH_USER)).status).toBe(404);
  });
});

describe('POST /api/admin/users/[id]/unblock', () => {
  beforeEach(() => givePassword('employee1'));

  it('allows signing in again, but a cookie revoked by the block stays dead', async () => {
    const admin = asUser('ADMIN');
    const oldSession = asUser('employee1');
    await apiBlock(admin, ids.employee1 as string);
    expect((await apiLogin('employee1', PASSWORD)).status).toBe(401);

    const response = await apiUnblock(admin, ids.employee1 as string);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await body(response)).toMatchObject({ isBlocked: false });
    expect((await apiLogin('employee1', PASSWORD)).status).toBe(200);
    expect((await apiMe(oldSession)).status).toBe(401);
  });

  it('restores login eligibility only: the password state is exactly as it was', async () => {
    const admin = asUser('ADMIN');
    db.update(users)
      .set({ mustChangePassword: true, temporaryPasswordExpiresAt: new Date(T0.getTime() + 1000) })
      .where(eq(users.id, ids.employee1 as string))
      .run();
    // Everything but the two fields a block/unblock round trip may legitimately touch.
    const unrelated = () => ({
      ...userRow(ids.employee1 as string),
      isBlocked: undefined,
      updatedAt: undefined,
    });
    const before = unrelated();

    await apiBlock(admin, ids.employee1 as string);
    await apiUnblock(admin, ids.employee1 as string);

    expect(userRow(ids.employee1 as string)?.isBlocked).toBe(false);
    expect(unrelated()).toStrictEqual(before);
    expect(before).toMatchObject({ mustChangePassword: true }); // the state was not a trivial one
  });

  it('keeps an account blocked after an administrator reset until it is explicitly unblocked', async () => {
    const admin = asUser('ADMIN');
    await apiBlock(admin, ids.employee1 as string);

    // What the (later) reset endpoint will do: issue a new temporary password for the account.
    const credential = await issueTemporaryCredential(clock);
    applyTemporaryCredential(db, ids.employee1 as string, credential);

    expect(userRow(ids.employee1 as string)).toMatchObject({
      isBlocked: true,
      mustChangePassword: true,
    });
    expect((await apiLogin('employee1', credential.plaintext)).status).toBe(401);

    await apiUnblock(admin, ids.employee1 as string);
    const signedIn = await apiLogin('employee1', credential.plaintext);

    expect(signedIn.status).toBe(200);
    expect(await body(signedIn)).toMatchObject({
      authStage: 'INITIAL_PASSWORD_CHANGE',
      mustChangePassword: true,
    });
  });

  it('unblocks only the account it names', async () => {
    const admin = asUser('ADMIN');
    await apiBlock(admin, ids.employee1 as string);
    await apiBlock(admin, ids.guest1 as string);

    await apiUnblock(admin, ids.employee1 as string);

    expect(userRow(ids.employee1 as string)?.isBlocked).toBe(false);
    expect(userRow(ids.guest1 as string)?.isBlocked).toBe(true);
  });

  it('is idempotent: unblocking an account that is not blocked succeeds and changes nothing', async () => {
    const admin = asUser('ADMIN');
    const live = asUser('employee1');

    const first = await apiUnblock(admin, ids.employee1 as string);
    const second = await apiUnblock(admin, ids.employee1 as string);

    expect([first.status, second.status]).toStrictEqual([200, 200]);
    expect((await apiMe(live)).status).toBe(200); // unblocking never ends a session
  });

  it('refuses a deleted account with 404', async () => {
    db.update(users)
      .set({ deletedAt: T0 })
      .where(eq(users.id, ids.employee1 as string))
      .run();

    expect((await apiUnblock(asUser('ADMIN'), ids.employee1 as string)).status).toBe(404);
  });
});

describe('DELETE /api/admin/users/[id] (SEC-19)', () => {
  beforeEach(() => {
    givePassword('employee2');
    db.transaction((tx) => seedTickets(tx));
  });

  it('answers 204 no-store and revokes the session of a logged-in user', async () => {
    const victim = asUser('employee2');
    expect((await apiMe(victim)).status).toBe(200);

    const response = await apiDelete(asUser('ADMIN'), ids.employee2 as string);

    expect(response.status).toBe(204);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
    // Looked at before any request touches them: a request would revoke them lazily (the account
    // is deleted), which would hide a deletion that forgot to.
    expect(sessionsAreRevoked(ids.employee2 as string)).toBe(true);
    expect((await apiMe(victim)).status).toBe(401);
  });

  it('hides the account from the list, the search and the detail view, and from sign-in', async () => {
    const admin = asUser('ADMIN');

    await apiDelete(admin, ids.employee2 as string);

    expect(logins(await body(await apiList(admin)))).not.toContain('employee2');
    expect((await body(await apiList(admin, '?q=employee2'))).total).toBe(0);
    expect((await apiGet(admin, ids.employee2 as string)).status).toBe(404);
    const signIn = await apiLogin('employee2', PASSWORD);
    expect(signIn.status).toBe(401);
    expect(await signIn.text()).toBe(GENERIC_401);
  });

  it("keeps the row, so the tickets' foreign keys stay valid", async () => {
    const own = DEMO_TICKETS.employee2ToSelf.id;
    const ticketsBefore = db.select().from(tickets).all();

    await apiDelete(asUser('ADMIN'), ids.employee2 as string);

    expect(userRow(ids.employee2 as string)).toMatchObject({ deletedAt: T0 });
    expect(db.select().from(tickets).all()).toStrictEqual(ticketsBefore);
    expect(db.all(sql`PRAGMA foreign_key_check`)).toStrictEqual([]);
    // The ticket the deleted user filed is still there for a Manager, still pointing at them.
    const listed = await body(await asUser('manager1').get(ticketsRoute, '/api/tickets'));
    expect(listed.items.find((t: { id: string }) => t.id === own)).toMatchObject({
      createdByUserId: ids.employee2,
      assignedToUserId: ids.employee2,
    });
  });

  it('reserves the login: it cannot be registered again', async () => {
    const admin = asUser('ADMIN');
    await apiDelete(admin, ids.employee2 as string);

    const response = await apiCreate(admin, { ...NEW_USER, login: 'employee2' });

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe('LOGIN_ALREADY_EXISTS');
  });

  it('leaves every other account alone', async () => {
    const bystander = asUser('employee1');
    const before = userRow(ids.employee1 as string);

    await apiDelete(asUser('ADMIN'), ids.employee2 as string);

    expect((await apiMe(bystander)).status).toBe(200);
    expect(userRow(ids.employee1 as string)).toStrictEqual(before);
  });

  it('is idempotent: deleting again is another 204 and keeps the time of the first deletion', async () => {
    const admin = asUser('ADMIN');

    const first = await apiDelete(admin, ids.employee2 as string);
    // Later, but inside the administrator's own idle timeout (15 minutes).
    fakeClock.set(new Date(T0.getTime() + 5 * 60 * 1000));
    const second = await apiDelete(admin, ids.employee2 as string);

    expect([first.status, second.status]).toStrictEqual([204, 204]);
    expect(userRow(ids.employee2 as string)?.deletedAt).toStrictEqual(T0);
  });

  it('revokes a session that appeared after the first deletion on the repeat', async () => {
    const admin = asUser('ADMIN');
    await apiDelete(admin, ids.employee2 as string);
    const late = asUser('employee2');

    await apiDelete(admin, ids.employee2 as string);

    expect((await apiMe(late)).status).toBe(401);
  });

  it('answers an account that never existed with 404', async () => {
    const response = await apiDelete(asUser('ADMIN'), NO_SUCH_USER);

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(NOT_FOUND);
  });
});

describe('the permanent ADMIN account cannot be blocked or deleted (SEC-29)', () => {
  it.each([
    ['block', (c: ApiClient, id: string) => apiBlock(c, id)],
    ['delete', (c: ApiClient, id: string) => apiDelete(c, id)],
  ])('%s answers 409 PROTECTED_ACCOUNT and changes nothing', async (_name, call) => {
    const id = ids.ADMIN as string;
    const admin = asUser('ADMIN');
    const before = userRow(id);
    const sessionsBefore = sessionRows(id);

    const response = await call(admin, id);

    expect(response.status).toBe(409);
    expect(await errorCode(response)).toBe(PROTECTED);
    expect(userRow(id)).toStrictEqual(before);
    // Nothing was revoked: the administrator is still signed in.
    expect(sessionRows(id).map((s) => s.revokedAt)).toStrictEqual(sessionsBefore.map(() => null));
    expect((await apiMe(admin)).status).toBe(200);
  });

  it('treats an unblock of ADMIN as the harmless no-op it is', async () => {
    const response = await apiUnblock(asUser('ADMIN'), ids.ADMIN as string);

    expect(response.status).toBe(200);
    expect(userRow(ids.ADMIN as string)?.isBlocked).toBe(false);
  });
});

describe('block, unblock and delete: who may call them', () => {
  const endpoints: [string, (c: ApiClient, id: string) => Promise<Response>][] = [
    ['block', apiBlock],
    ['unblock', apiUnblock],
    ['delete', apiDelete],
  ];

  describe.each(endpoints)('%s', (_name, call) => {
    it.each(['manager1', 'employee1', 'guest1'])(
      '%s receives 403 and nothing happens',
      async (login) => {
        const target = ids.employee2 as string;
        const bystander = asUser('employee2');
        const before = userRow(target);

        const response = await call(asUser(login), target);

        expect(response.status).toBe(403);
        expect(await response.text()).toBe(FORBIDDEN);
        expect(userRow(target)).toStrictEqual(before);
        expect((await apiMe(bystander)).status).toBe(200);
      },
    );

    it('answers an anonymous caller with 401', async () => {
      const response = await call(asUser(), ids.employee2 as string);

      expect(response.status).toBe(401);
      expect(await response.text()).toBe(NOT_SIGNED_IN);
    });

    it('refuses an Administrator session that must still change its password', async () => {
      const response = await call(
        asUser('ADMIN', 'INITIAL_PASSWORD_CHANGE'),
        ids.employee2 as string,
      );

      expect(response.status).toBe(403);
      expect(await response.text()).toContain(PASSWORD_CHANGE);
      expect(userRow(ids.employee2 as string)).toMatchObject({ isBlocked: false, deletedAt: null });
    });

    it('answers a malformed id with 400', async () => {
      expect((await call(asUser('ADMIN'), 'not-a-uuid')).status).toBe(400);
    });
  });
});
