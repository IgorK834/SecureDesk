import path from 'node:path';
import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seedWorld, signInAs } from '../apps/backend/src/server/db/__fixtures__/seeded-world';
import { setUpSharedTestDb } from '../apps/backend/src/server/db/__fixtures__/shared-test-db';
import { db } from '../apps/backend/src/server/db/client';
import { defineRoute } from '../apps/backend/src/server/http/route-handler';
import { PERMISSIONS } from '../apps/backend/src/server/permissions/codes';
import { type RouteModule, createApiClient } from './helpers/api-client';
import { loadRoutes } from './helpers/route-scanner';

// SEC-15 / SEC-16: administration is for the Administrator only. Anonymous callers get 401, and
// every other role gets 403 with nothing from the resource in the body. This runs the whole
// pipeline through the real route handlers, for every /api/admin/** route found on disk.
//
// No real /api/admin route exists until the user-management task (SD-16). Until then the
// matrix is proven on a test-only route configured exactly as that endpoint will be
// (FULLY_AUTHENTICATED + users:read). When real routes appear they join the matrix on their
// own, and the stand-in can be deleted.

const API_ROOT = path.resolve(__dirname, '../apps/backend/src/app/api');

const NOT_SIGNED_IN = '{"error":{"code":"AUTH_REQUIRED","message":"Wymagane zalogowanie"}}';
const FORBIDDEN = '{"error":{"code":"AUTH_FORBIDDEN","message":"Brak uprawnień"}}';
const SECRET = 'secret-user-data';

setUpSharedTestDb();
let ids: Record<string, string>;
beforeEach(() => {
  ids = seedWorld(db);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

const standInHandler = vi.fn(() => NextResponse.json({ users: [SECRET] }));
const standIn = defineRoute({
  name: 'test.admin_users_stand_in',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  handler: standInHandler,
});

interface Target {
  label: string;
  route: string;
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';
  module: RouteModule;
  isStandIn: boolean;
}

const realAdminRoutes = (await loadRoutes(API_ROOT)).filter(
  ({ route }) => route === '/api/admin' || route.startsWith('/api/admin/'),
);

const targets: Target[] = [
  {
    label: 'GET /api/admin/users (test-only stand-in)',
    route: '/api/admin/users',
    method: 'GET',
    module: { GET: standIn },
    isStandIn: true,
  },
  ...realAdminRoutes.map(({ route, method, handler }) => ({
    label: `${method} ${route}`,
    route,
    method,
    module: { [method]: handler } as RouteModule,
    isStandIn: false,
  })),
];

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

describe.each(targets)('$label', ({ route, method, module, isStandIn }) => {
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
    if (isStandIn) expect(standInHandler).not.toHaveBeenCalled();
  });

  it.each(REFUSED)('answers $who with 403 and no resource data', async ({ login }) => {
    const client = createApiClient().signIn(signInAs(db, ids[login] as string));

    const response = await client.request(module, method, url, options);
    const body = await response.text();

    expect(response.status).toBe(403);
    expect(body).toBe(FORBIDDEN); // exactly the envelope: no extra fields, no resource data
    expect(body).not.toContain(SECRET);
    if (isStandIn) expect(standInHandler).not.toHaveBeenCalled();
  });

  it('lets the Administrator through the guard', async () => {
    const client = createApiClient().signIn(signInAs(db, ids.ADMIN as string));

    const response = await client.request(module, method, url, options);

    // A real route may still answer 400 or 404 to an empty probe; what must not happen is a
    // refusal of the one role that owns administration.
    expect([401, 403]).not.toContain(response.status);
    if (isStandIn) {
      expect(response.status).toBe(200);
      expect(await response.text()).toContain(SECRET);
    }
  });
});
