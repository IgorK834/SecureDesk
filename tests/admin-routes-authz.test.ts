import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedWorld, signInAs } from '../apps/backend/src/server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../apps/backend/src/server/db/__fixtures__/shared-test-db';
import { db } from '../apps/backend/src/server/db/client';
import { type RouteModule, createApiClient } from './helpers/api-client';
import { loadRoutes } from './helpers/route-scanner';

// SEC-15 / SEC-16: administration is for the Administrator only. Anonymous callers get 401, and
// every other role gets 403 with nothing from the resource in the body. This runs the whole
// pipeline through the real route handlers, for every /api/admin/** route found on disk.
//
// Every /api/admin/** route found on disk joins the matrix on its own, so a new admin endpoint is
// covered the moment it is written. The list of routes it must find is checked below, so the
// matrix cannot quietly shrink to nothing if the scan ever stops seeing them.

const API_ROOT = path.resolve(__dirname, '../apps/backend/src/app/api');

const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';

setUpSharedTestDb();
let ids: Record<string, string>;
beforeEach(() => {
  ids = seedWorld(db);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

interface Target {
  label: string;
  route: string;
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  module: RouteModule;
}

const realAdminRoutes = (await loadRoutes(API_ROOT)).filter(
  ({ route }) => route === '/api/admin' || route.startsWith('/api/admin/'),
);

const targets: Target[] = realAdminRoutes.map(({ route, method, handler }) => ({
  label: `${method} ${route}`,
  route,
  method,
  module: { [method]: handler } as RouteModule,
}));

/** `/api/admin/users/[id]` becomes a callable path plus the `params` Next would pass. */
function callable(route: string) {
  const params: Record<string, string> = {};
  const url = route.replace(/\[(?:\.\.\.)?(\w+)\]/g, (_, name: string) => {
    params[name] = 'x';
    return 'x';
  });
  return { url, params };
}

const REFUSED = [
  { who: 'a Manager', login: 'manager1' },
  { who: 'an Employee', login: 'employee1' },
  { who: 'a Guest', login: 'guest1' },
] as const;

describe.each(targets)('$label', ({ route, method, module }) => {
  const { url, params } = callable(route);
  // A body-carrying call is sent with valid JSON, so a refusal can only come from authorization.
  const options = {
    params,
    ...(method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? {} : { json: {} }),
  };

  it('answers an anonymous caller with 401 and nothing else', async () => {
    const response = await createApiClient().request(module, method, url, options);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe(NOT_SIGNED_IN);
  });

  it.each(REFUSED)('answers $who with 403 and no resource data', async ({ login }) => {
    const client = createApiClient().signIn(signInAs(db, ids[login] as string));

    const response = await client.request(module, method, url, options);
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toBe(FORBIDDEN); // exactly the envelope: no extra fields, no resource data
  });

  it('lets the Administrator through the guard', async () => {
    const client = createApiClient().signIn(signInAs(db, ids.ADMIN as string));

    const response = await client.request(module, method, url, options);

    // A real route may still answer 400 or 404 to an empty probe; what must not happen is a
    // refusal of the one role that owns administration.
    expect([401, 403]).not.toContain(response.status);
  });
});

describe('the admin routes the matrix covers', () => {
  it('are all of the user-management endpoints, so the matrix above cannot be empty by accident', () => {
    expect(targets.map(({ label }) => label).sort()).toEqual(
      [
        'GET /api/admin/users',
        'POST /api/admin/users',
        'GET /api/admin/users/[id]',
        'PATCH /api/admin/users/[id]',
        'DELETE /api/admin/users/[id]',
        'POST /api/admin/users/[id]/block',
        'POST /api/admin/users/[id]/unblock',
      ].sort(),
    );
  });
});
