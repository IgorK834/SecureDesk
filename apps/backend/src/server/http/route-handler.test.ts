import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApiClient } from '../../../../../tests/helpers/api-client';
import { FakeClock } from '../../../../../tests/helpers/fake-clock';
import { sessionCookieName } from '../auth/cookie';
import { createSession } from '../auth/session-service';
import { captureOutput } from '../__fixtures__/capture-output';
import { seedWorld, signInAs } from '../db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../db/__fixtures__/shared-test-db';
import { db } from '../db/client';
import { ConflictError as DbConflictError } from '../db/errors';
import { permissions, rolePermissions, sessions } from '../db/schema';
import { type PermissionCode, PERMISSIONS, ROLES } from '../permissions/codes';
import { ApiError, ConflictError, NotFoundError } from './errors';
import { MAX_BODY_BYTES } from './json-body';
import { defineRoute, getRouteMeta } from './route-handler';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const T0 = new Date('2030-01-01T00:00:00.000Z');
const URL_BASE = 'http://localhost:3000';

const GENERIC_500 = '{"error":{"code":"INTERNAL_ERROR","message":"Wystąpił błąd serwera"}}';
const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';
const INVALID = '{"error":{"code":"VALIDATION_ERROR","message":"Nieprawidłowe dane żądania"}}';

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

const request = (path = '/api/test', init?: ConstructorParameters<typeof NextRequest>[1]) =>
  new NextRequest(`${URL_BASE}${path}`, init);

// NextRequest takes its own RequestInit, narrower than the DOM one.
type RequestInitOf = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const withCookie = (
  token: string,
  init: Omit<RequestInitOf, 'headers'> & { headers?: Record<string, string> } = {},
) => ({
  ...init,
  headers: { ...init.headers, cookie: `${sessionCookieName()}=${token}` },
});

// An admin-style route: it holds data a refusal must never leak.
const secretHandler = vi.fn(() => NextResponse.json({ users: ['secret-user-data'] }));
const adminRoute = defineRoute({
  name: 'test.admin_users',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  handler: secretHandler,
});

describe('error mapping', () => {
  it('returns the handler’s own response and passes it the request, a request id and no session when public', async () => {
    const handler = vi.fn(() => new Response('ok', { status: 201 }));
    const route = defineRoute({ name: 'test.public', auth: 'public', handler });
    const req = request();

    const response = await route(req);

    expect(response.status).toBe(201);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        request: req,
        requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        session: undefined,
      }),
    );
  });

  it('awaits an asynchronous handler and gives every request its own id', async () => {
    const seen: string[] = [];
    const route = defineRoute({
      name: 'test.public',
      auth: 'public',
      handler: async ({ requestId }) => {
        seen.push(requestId);
        return new Response(null, { status: 202 });
      },
    });

    expect((await route(request())).status).toBe(202);
    await route(request());

    expect(new Set(seen).size).toBe(2);
  });

  it('turns an ApiError into its status, code and message, and logs only the event and request id', async () => {
    const output = captureOutput();
    const route = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        throw new NotFoundError();
      },
    });

    const response = await route(request());
    const lines = output.lines();
    output.restore();

    expect(response.status).toBe(404);
    expect(await response.text()).toBe(
      '{"error":{"code":"NOT_FOUND","message":"Nie znaleziono zasobu"}}',
    );
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toStrictEqual({
      event: 'test.route.denied',
      requestId: expect.any(String),
    });
  });

  it('passes the details of an ApiError on to the client', async () => {
    const route = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        throw new ApiError(400, 'PASSWORD_POLICY_VIOLATION', 'Komunikat', {
          violations: ['TOO_SHORT'],
        });
      },
    });

    const response = await route(request());

    expect(response.status).toBe(400);
    expect(await response.json()).toStrictEqual({
      error: {
        code: 'PASSWORD_POLICY_VIOLATION',
        message: 'Komunikat',
        details: { violations: ['TOO_SHORT'] },
      },
    });
  });

  it('answers an explicit ConflictError, and a database uniqueness violation, with the same 409', async () => {
    const explicit = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        throw new ConflictError();
      },
    });
    const fromDatabase = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        throw new DbConflictError();
      },
    });

    const bodies = await Promise.all(
      [explicit, fromDatabase].map(async (route) => {
        const response = await route(request());
        return [response.status, await response.text()];
      }),
    );

    expect(bodies[0]).toStrictEqual([
      409,
      '{"error":{"code":"CONFLICT","message":"Zasób już istnieje"}}',
    ]);
    expect(bodies[1]).toStrictEqual(bodies[0]);
  });

  it('also handles a rejected promise from an asynchronous handler', async () => {
    const route = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: async () => {
        throw new ApiError(403, 'AUTH_FORBIDDEN', 'Brak uprawnień');
      },
    });

    expect((await route(request())).status).toBe(403);
  });

  // A forced internal error that carries everything that must never reach a client: SQL text,
  // a hash, a stack trace and a file path.
  it('answers any other failure with a generic 500 that exposes no stack, SQL or path, and logs none of it', async () => {
    const output = captureOutput();
    const route = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        const error = new Error(
          'SQLITE_ERROR near "token_hash": SELECT * FROM sessions WHERE token_hash = $argon2id$leaked',
        );
        error.stack = `Error: boom\n    at handler (/Users/dev/securedesk/apps/backend/src/secret.ts:12:5)`;
        throw error;
      },
    });

    const response = await route(request());
    const lines = output.lines();
    output.restore();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).toBe(GENERIC_500);
    expect(text).not.toMatch(
      /SELECT|SQLITE|token_hash|argon2|leaked|\/Users|\.ts|\bat \w+ \(|node_modules/,
    );
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ event: 'test.route.error' });
    expect(lines.join('\n')).not.toMatch(/SELECT|SQLITE|token_hash|argon2|leaked|\/Users|\.ts/);
  });

  it('does not leak the message of a real database error either', async () => {
    const route = defineRoute({
      name: 'test.route',
      auth: 'public',
      handler: () => {
        db.$client.prepare('SELECT * FROM table_that_does_not_exist').all(); // throws here
        return new Response();
      },
    });

    const response = await route(request());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe(GENERIC_500);
  });
});

describe('authentication, stage and permission', () => {
  it.each([
    ['an anonymous caller', 401, undefined, NOT_SIGNED_IN],
    ['an Administrator', 200, 'ADMIN', undefined],
    ['a Manager', 403, 'manager1', FORBIDDEN],
    ['an Employee', 403, 'employee1', FORBIDDEN],
    ['a Guest', 403, 'guest1', FORBIDDEN],
  ])('a users:read route answers %s with %i', async (_, status, login, body) => {
    secretHandler.mockClear();
    const client = createApiClient();
    if (login) client.signIn(signInAs(db, ids[login] as string));

    const response = await client.get({ GET: adminRoute }, '/api/admin/users');
    const text = await response.text();

    expect(response.status).toBe(status);
    if (body) {
      // Refused: byte-identical envelope, the handler never ran, and no user data in the body.
      expect(text).toBe(body);
      expect(secretHandler).not.toHaveBeenCalled();
      expect(text).not.toContain('secret-user-data');
    } else {
      expect(secretHandler).toHaveBeenCalledOnce();
    }
  });

  it('refuses a session that still owes a password change with 403 AUTH_PASSWORD_CHANGE_REQUIRED', async () => {
    const client = createApiClient().signIn(
      signInAs(db, ids.ADMIN as string, 'INITIAL_PASSWORD_CHANGE'),
    );

    const response = await client.get({ GET: adminRoute }, '/api/admin/users');

    expect(response.status).toBe(403);
    expect((await response.json()) as object).toStrictEqual({
      error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED', message: 'Wymagana zmiana hasła' },
    });
  });

  it('admits a restricted stage only to a route that lists it', async () => {
    const forInitialChange = defineRoute({
      name: 'test.initial',
      auth: { stages: ['INITIAL_PASSWORD_CHANGE'] },
      handler: () => new Response('ok'),
    });
    const token = signInAs(db, ids.guest1 as string, 'INITIAL_PASSWORD_CHANGE');

    const response = await createApiClient()
      .signIn(token)
      .get({ GET: forInitialChange }, '/api/anything');

    expect(response.status).toBe(200);
  });

  it('reads permissions from the database on every request: removing one from a role applies at once, without a new login', async () => {
    const client = createApiClient().signIn(signInAs(db, ids.ADMIN as string));
    expect((await client.get({ GET: adminRoute }, '/api/admin/users')).status).toBe(200);

    db.delete(rolePermissions)
      .where(
        and(
          eq(rolePermissions.roleId, ROLES.ADMINISTRATOR),
          eq(rolePermissions.permissionId, PERMISSIONS.USERS_READ),
        ),
      )
      .run();

    // Same cookie, same session: the very next request is refused.
    expect((await client.get({ GET: adminRoute }, '/api/admin/users')).status).toBe(403);
  });

  it('applies a permission added to a role on the next request too', async () => {
    const client = createApiClient().signIn(signInAs(db, ids.guest1 as string));
    expect((await client.get({ GET: adminRoute }, '/api/admin/users')).status).toBe(403);

    db.insert(rolePermissions)
      .values({ roleId: ROLES.GUEST, permissionId: PERMISSIONS.USERS_READ })
      .run();

    expect((await client.get({ GET: adminRoute }, '/api/admin/users')).status).toBe(200);
  });

  it('never allows a permission code that is not defined, even if the database grants it to the role', async () => {
    db.insert(permissions)
      .values({ id: 'made:up', code: 'made:up', description: 'not in PERMISSIONS' })
      .run();
    db.insert(rolePermissions)
      .values({ roleId: ROLES.ADMINISTRATOR, permissionId: 'made:up' })
      .run();
    const route = defineRoute({
      name: 'test.unknown',
      auth: { stages: ['FULLY_AUTHENTICATED'], permission: 'made:up' as PermissionCode },
      handler: () => new Response('ok'),
    });

    const response = await createApiClient()
      .signIn(signInAs(db, ids.ADMIN as string))
      .get({ GET: route }, '/api/anything');

    expect(response.status).toBe(403);
  });

  it('admits a role holding any one permission of a list', async () => {
    const route = defineRoute({
      name: 'test.any_of',
      auth: {
        stages: ['FULLY_AUTHENTICATED'],
        permission: [PERMISSIONS.TICKETS_READ_ALL, PERMISSIONS.TICKETS_READ_OWN],
      },
      handler: () => new Response('ok'),
    });
    const statusFor = async (login: string) =>
      (
        await createApiClient()
          .signIn(signInAs(db, ids[login] as string))
          .get({ GET: route }, '/api/anything')
      ).status;

    expect(await statusFor('guest1')).toBe(200); // has read:own
    expect(await statusFor('manager1')).toBe(200);
    expect(await statusFor('ADMIN')).toBe(403); // has none of them
  });

  it('closes a route whose list of permissions is empty', async () => {
    const route = defineRoute({
      name: 'test.empty',
      auth: { stages: ['FULLY_AUTHENTICATED'], permission: [] },
      handler: () => new Response('ok'),
    });

    const response = await createApiClient()
      .signIn(signInAs(db, ids.ADMIN as string))
      .get({ GET: route }, '/api/anything');

    expect(response.status).toBe(403);
  });

  it('lets a public route answer without a session, and ignores a bogus cookie', async () => {
    const route = defineRoute({
      name: 'test.public',
      auth: 'public',
      handler: () => new Response('ok'),
    });

    expect((await route(request())).status).toBe(200);
    expect((await route(request('/api/x', withCookie('A'.repeat(43))))).status).toBe(200);
  });
});

describe('activity recording', () => {
  function open(login = 'ADMIN') {
    const { token, session } = createSession(db, ids[login] as string, 'FULLY_AUTHENTICATED');
    return { token, id: session.id };
  }
  const lastActivityOf = (id: string) =>
    db.select().from(sessions).where(eq(sessions.id, id)).get()?.lastActivityAt;
  const call = (token: string) => adminRoute(request('/api/admin/users', withCookie(token)));

  it('counts an admitted request as activity, so the idle clock restarts', async () => {
    const { token, id } = open();
    fakeClock.advance(10 * MINUTE_MS);

    expect((await call(token)).status).toBe(200);

    expect(lastActivityOf(id)).toStrictEqual(new Date(T0.getTime() + 10 * MINUTE_MS));
  });

  it('keeps a session alive while it is used regularly, until the 12-hour limit ends it regardless', async () => {
    const { token } = open();

    for (let elapsed = 10; elapsed < 12 * 60; elapsed += 10) {
      fakeClock.set(new Date(T0.getTime() + elapsed * MINUTE_MS));
      expect((await call(token)).status, `at +${elapsed} min`).toBe(200);
    }

    fakeClock.set(new Date(T0.getTime() + 12 * HOUR_MS));
    expect((await call(token)).status).toBe(401);
  });

  // If refusals counted as activity, anyone holding an old cookie could keep a session alive
  // forever by hammering an endpoint they are not allowed to use.
  it.each([
    ['a missing permission', 'guest1'],
    ['a wrong stage', 'ADMIN'],
  ])('never extends a session on a refusal for %s', async (_, login) => {
    const stage = login === 'ADMIN' ? 'INITIAL_PASSWORD_CHANGE' : 'FULLY_AUTHENTICATED';
    const { token, session } = createSession(db, ids[login] as string, stage);
    fakeClock.advance(10 * MINUTE_MS);

    expect((await call(token)).status).toBe(403);
    expect(lastActivityOf(session.id)).toStrictEqual(T0);

    // 16 minutes after the last real activity, only 6 after the refused request.
    fakeClock.advance(6 * MINUTE_MS);
    expect((await call(token)).status).toBe(401);
  });

  it('does not touch a stored session when the token is unknown', async () => {
    const { id } = open();

    expect((await call('A'.repeat(43))).status).toBe(401);

    expect(lastActivityOf(id)).toStrictEqual(T0);
  });

  it('counts an authorized request as activity even when its input is then refused', async () => {
    const route = defineRoute({
      name: 'test.body',
      auth: { stages: ['FULLY_AUTHENTICATED'] },
      body: z.object({ a: z.string() }).strict(),
      handler: () => new Response('ok'),
    });
    const { token, id } = open();
    fakeClock.advance(5 * MINUTE_MS);

    const response = await route(
      request(
        '/api/x',
        withCookie(token, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{"wrong":1}',
        }),
      ),
    );

    expect(response.status).toBe(400);
    expect(lastActivityOf(id)).toStrictEqual(new Date(T0.getTime() + 5 * MINUTE_MS));
  });
});

describe('input validation', () => {
  const BodySchema = z.object({ title: z.string().min(1) }).strict();
  const handler = vi.fn(({ body }: { body: { title: string } }) => NextResponse.json(body));
  const bodyRoute = defineRoute({
    name: 'test.body',
    auth: { stages: ['FULLY_AUTHENTICATED'] },
    body: BodySchema,
    handler,
  });

  const signedIn = () => createApiClient().signIn(signInAs(db, ids.guest1 as string));
  const json = (title: unknown) => ({ json: { title } });

  beforeEach(() => {
    handler.mockClear();
  });

  it('hands the handler the parsed body', async () => {
    const response = await signedIn().post({ POST: bodyRoute }, '/api/x', json('hello'));

    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ title: 'hello' });
  });

  it.each([
    ['a wrong type', json(1)],
    ['an empty value', json('')],
    ['an extra key (mass assignment)', { json: { title: 'x', role: 'ADMINISTRATOR' } }],
    [
      'text that is not JSON',
      { body: 'not json', headers: { 'content-type': 'application/json' } },
    ],
    ['an empty body', { body: '', headers: { 'content-type': 'application/json' } }],
  ])('refuses %s with a 400 that says nothing about the cause', async (_, options) => {
    const response = await signedIn().post({ POST: bodyRoute }, '/api/x', options);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(INVALID);
    expect(handler).not.toHaveBeenCalled();
  });

  // A cross-site HTML form can send these without a CORS preflight.
  it.each(['text/plain', 'application/x-www-form-urlencoded', 'application/vnd.api+json', ''])(
    'refuses a valid body sent as "%s"',
    async (contentType) => {
      const response = await signedIn().post({ POST: bodyRoute }, '/api/x', {
        body: '{"title":"x"}',
        headers: { 'content-type': contentType },
      });

      expect(response.status).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('does the header checks first, before anyone is looked up (cheap rejection)', async () => {
    const wrongType = await createApiClient().post({ POST: bodyRoute }, '/api/x', {
      body: '{"title":"x"}',
      headers: { 'content-type': 'text/plain' },
    });

    expect(wrongType.status).toBe(400);
  });

  it('does not read or validate the body before the session is admitted: no session and a bad body is 401', async () => {
    const response = await createApiClient().post({ POST: bodyRoute }, '/api/x', json(1));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it('answers a missing permission with 403 before it looks at invalid input', async () => {
    const route = defineRoute({
      name: 'test.admin_body',
      auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_CREATE },
      body: BodySchema,
      handler,
    });

    const response = await signedIn().post({ POST: route }, '/api/admin/x', json(1));

    expect(response.status).toBe(403);
  });

  describe('size limit', () => {
    const sized = (bytes: number) => ({
      json: { title: 'a'.repeat(bytes - '{"title":""}'.length) },
    });

    it('accepts a body of exactly the limit', async () => {
      const response = await signedIn().post({ POST: bodyRoute }, '/api/x', sized(MAX_BODY_BYTES));

      expect(response.status).toBe(200);
    });

    it('refuses one byte more with 413, going by the declared Content-Length, before any lookup', async () => {
      const response = await createApiClient().post({ POST: bodyRoute }, '/api/x', {
        ...sized(MAX_BODY_BYTES + 1),
        // A real HTTP request carries this header; an in-process Request does not synthesize it.
        headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      });

      expect(response.status).toBe(413);
      expect(await response.text()).toBe(
        '{"error":{"code":"PAYLOAD_TOO_LARGE","message":"Żądanie jest zbyt duże"}}',
      );
      expect(handler).not.toHaveBeenCalled();
    });

    // Content-Length can be missing (chunked upload) or false, so the bytes received are counted.
    it('refuses an oversized body that declares no length, and stops reading it', async () => {
      const chunk = new Uint8Array(16 * 1024).fill(97);
      let pulled = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(chunk);
          if (pulled >= 1000) controller.close();
        },
      });
      const { token } = createSession(db, ids.guest1 as string, 'FULLY_AUTHENTICATED');

      const response = await bodyRoute(
        request('/api/x', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `${sessionCookieName()}=${token}`,
          },
          body: stream,
          duplex: 'half',
        } as RequestInitOf),
      );

      expect(response.status).toBe(413);
      expect(pulled).toBeLessThan(100); // nowhere near the 1000 chunks (16 MB) offered
      expect(handler).not.toHaveBeenCalled();
    });

    it('applies to a route that reads no body too (a declared length is enough to refuse)', async () => {
      const route = defineRoute({
        name: 'test.nobody',
        auth: 'public',
        handler: () => new Response('ok'),
      });

      const response = await createApiClient().post({ POST: route }, '/api/x', {
        body: 'x'.repeat(MAX_BODY_BYTES + 1),
        headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
      });

      expect(response.status).toBe(413);
    });
  });

  describe('query string', () => {
    const QuerySchema = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(20) })
      .strict();
    const queryRoute = defineRoute({
      name: 'test.query',
      auth: { stages: ['FULLY_AUTHENTICATED'] },
      query: QuerySchema,
      handler: ({ query }) => NextResponse.json(query),
    });

    it('hands the handler the parsed query, with defaults applied', async () => {
      const client = signedIn();

      expect(await (await client.get({ GET: queryRoute }, '/api/x?limit=5')).json()).toStrictEqual({
        limit: 5,
      });
      expect(await (await client.get({ GET: queryRoute }, '/api/x')).json()).toStrictEqual({
        limit: 20,
      });
    });

    it.each(['?limit=0', '?limit=101', '?limit=abc', '?other=1'])(
      'refuses %s with a 400',
      async (search) => {
        const response = await signedIn().get({ GET: queryRoute }, `/api/x${search}`);

        expect(response.status).toBe(400);
        expect(await response.text()).toBe(INVALID);
      },
    );

    it('checks the session before the query: no session and a bad query is 401', async () => {
      const response = await createApiClient().get({ GET: queryRoute }, '/api/x?limit=abc');

      expect(response.status).toBe(401);
    });
  });

  describe('path parameters', () => {
    const paramRoute = defineRoute({
      name: 'test.params',
      auth: { stages: ['FULLY_AUTHENTICATED'] },
      params: z.object({ id: z.uuid() }),
      handler: ({ params }) => NextResponse.json(params),
    });

    it('hands the handler the validated segments', async () => {
      const id = '4a5f3c1e-0b2d-4e8a-9c7b-1d2e3f4a5b6c';

      const response = await signedIn().get({ GET: paramRoute }, `/api/x/${id}`, {
        params: { id },
      });

      expect(await response.json()).toStrictEqual({ id });
    });

    it('refuses a malformed segment with a 400', async () => {
      const response = await signedIn().get({ GET: paramRoute }, '/api/x/not-a-uuid', {
        params: { id: 'not-a-uuid' },
      });

      expect(response.status).toBe(400);
    });

    it('refuses a request that arrives without the segments Next.js should have supplied', async () => {
      const { token } = createSession(db, ids.guest1 as string, 'FULLY_AUTHENTICATED');

      const response = await paramRoute(request('/api/x', withCookie(token)));

      expect(response.status).toBe(400);
    });
  });
});

describe('route metadata (read by the conformance test)', () => {
  it('records the name and how the route authenticates', () => {
    expect(getRouteMeta(adminRoute)).toStrictEqual({
      name: 'test.admin_users',
      auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
    });
    expect(
      getRouteMeta(defineRoute({ name: 'p', auth: 'public', handler: () => new Response() })),
    ).toStrictEqual({ name: 'p', auth: 'public' });
  });

  it('knows nothing about a handler that was not built by defineRoute', () => {
    expect(getRouteMeta(() => new Response())).toBeUndefined();
    expect(getRouteMeta(async function GET() {})).toBeUndefined();
    expect(getRouteMeta('GET')).toBeUndefined();
    expect(getRouteMeta(undefined)).toBeUndefined();
  });
});

// `tsc --noEmit` (npm run typecheck) fails if any of these @ts-expect-error lines stops being an
// error, so a route that forgets `auth`, or uses an unknown permission, cannot be written.
describe('type-level guarantees', () => {
  it('rejects a route without `auth`, an unknown permission, an unknown stage and a session on a public route', () => {
    // @ts-expect-error `auth` is required: every route must say who may call it
    defineRoute({ name: 'x', handler: () => new Response() });

    defineRoute({
      name: 'x',
      // @ts-expect-error only codes from PERMISSIONS are accepted
      auth: { stages: ['FULLY_AUTHENTICATED'], permission: 'users:everything' },
      handler: () => new Response(),
    });

    defineRoute({
      name: 'x',
      // @ts-expect-error only known auth stages are accepted
      auth: { stages: ['SUPERUSER'] },
      handler: () => new Response(),
    });

    defineRoute({
      name: 'x',
      auth: 'public',
      // @ts-expect-error a public route has no session to read
      handler: ({ session }) => Response.json(session.user),
    });

    expect(true).toBe(true);
  });

  it('gives a non-public handler a typed session', () => {
    defineRoute({
      name: 'x',
      auth: { stages: ['FULLY_AUTHENTICATED'] },
      handler: ({ session }) => Response.json(session.user.id),
    });

    expect(true).toBe(true);
  });
});
