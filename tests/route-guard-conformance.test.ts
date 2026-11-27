import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defineRoute, getRouteMeta } from '../apps/backend/src/server/http/route-handler';
import { type ExportedHandler, loadRoutes } from './helpers/route-scanner';

// The guardrail behind "deny by default": authorization lives in `defineRoute`, so the way to
// expose an endpoint by accident is to write a route that does not use it. This test scans the
// real API and fails on that, so a forgotten check is caught in code review and CI instead of
// in production. (Hiding a control in Angular is not access control; the server is.)

const API_ROOT = path.resolve(__dirname, '../apps/backend/src/app/api');
const FIXTURES_ROOT = path.resolve(__dirname, 'fixtures/conformance');

// The only routes allowed to say `auth: 'public'`; anything else still fails closed.
const PUBLIC_ROUTE_ALLOWLIST: ReadonlySet<string> = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/captcha/config',
  '/api/captcha/challenge',
  '/api/backup/config',
  '/api/webhooks/canarytokens/[secret]',
]);

const WEBHOOK_CSRF_ALLOWLIST = new Set(['POST /api/webhooks/canarytokens/[secret]']);

const isAdminRoute = (route: string) => route === '/api/admin' || route.startsWith('/api/admin/');

/** Every way the given handlers break the rules, one readable line each. */
function violationsOf(handlers: ExportedHandler[]): string[] {
  const found: string[] = [];
  for (const { route, method, handler } of handlers) {
    const label = `${method} ${route}`;
    const meta = getRouteMeta(handler);
    if (!meta) {
      found.push(`${label}: not created through defineRoute`);
      continue;
    }

    if (meta.auth === 'public' && !PUBLIC_ROUTE_ALLOWLIST.has(route)) {
      found.push(`${label}: public but not on the allowlist`);
    }
    if (meta.csrf === 'webhook' && !WEBHOOK_CSRF_ALLOWLIST.has(label)) {
      found.push(`${label}: webhook CSRF exemption is not on the allowlist`);
    }
    if (isAdminRoute(route)) {
      const permission = meta.auth === 'public' ? undefined : meta.auth.permission;
      const named =
        typeof permission === 'string' || (permission !== undefined && permission.length > 0);
      if (!named) found.push(`${label}: admin route without a permission`);
    }
  }
  return found.sort();
}

describe('route guard conformance: the real API', () => {
  it('finds the routes it is meant to check (so a wrong path cannot make the scan pass by seeing nothing)', async () => {
    const found = (await loadRoutes(API_ROOT)).map(({ method, route }) => `${method} ${route}`);

    expect(found).toEqual(
      expect.arrayContaining([
        'GET /api/health',
        'GET /api/backup/config',
        'GET /api/captcha/config',
        'POST /api/captcha/challenge',
        'POST /api/auth/login',
        'POST /api/auth/logout',
        'GET /api/auth/me',
        'POST /api/auth/change-password',
        'POST /api/auth/change-initial-password',
      ]),
    );
  });

  it('has no route that bypasses defineRoute, no unnamed admin permission and no unlisted public route', async () => {
    expect(violationsOf(await loadRoutes(API_ROOT))).toEqual([]);
  });

  it('makes only the allowlisted routes public', async () => {
    const publicRoutes = (await loadRoutes(API_ROOT))
      .filter(({ handler }) => getRouteMeta(handler)?.auth === 'public')
      .map(({ route }) => route)
      .sort();

    expect(publicRoutes).toEqual([
      '/api/auth/login',
      '/api/backup/config',
      '/api/captcha/challenge',
      '/api/captcha/config',
      '/api/health',
      '/api/webhooks/canarytokens/[secret]',
    ]);
  });

  it('SEC-94 finds precisely the reviewed webhook CSRF exemption', async () => {
    const routes = await loadRoutes(API_ROOT);
    expect(
      routes
        .filter(({ handler }) => getRouteMeta(handler)?.csrf === 'webhook')
        .map(({ method, route }) => method + ' ' + route),
    ).toEqual([...WEBHOOK_CSRF_ALLOWLIST]);
  });
});

// The scan is only worth anything if it can fail. These routes break each rule on purpose
// (see tests/fixtures/conformance); the scan must name every one and accept the conforming two.
describe('route guard conformance: the scan itself', () => {
  it('SEC-94 rejects a second CSRF exemption and requires a webhook authentication check', () => {
    const options = {
      name: 'fixture.other',
      auth: 'public',
      csrf: 'webhook',
      handler: () => new Response(),
    } as const;
    const handler = defineRoute({ ...options, authenticateWebhook: () => undefined });
    expect(violationsOf([{ route: '/api/auth/login', method: 'POST', handler }])).toEqual([
      'POST /api/auth/login: webhook CSRF exemption is not on the allowlist',
    ]);
    expect(() => defineRoute(options as Parameters<typeof defineRoute>[0])).toThrow(
      /authentication check/,
    );
  });
  it('flags a route written without defineRoute, an unlisted public route and an admin route without a permission', async () => {
    expect(violationsOf(await loadRoutes(FIXTURES_ROOT))).toEqual([
      'GET /api/admin/open: admin route without a permission',
      'GET /api/admin/public: admin route without a permission',
      'GET /api/admin/public: public but not on the allowlist',
      'GET /api/plain: not created through defineRoute',
      'POST /api/public-secret: public but not on the allowlist',
    ]);
  });

  it('accepts a conforming business route and a conforming admin route', async () => {
    const conforming = (await loadRoutes(FIXTURES_ROOT)).filter(({ route }) =>
      ['/api/ok', '/api/admin/ok'].includes(route),
    );

    expect(conforming).toHaveLength(2);
    expect(violationsOf(conforming)).toEqual([]);
  });

  it('treats a handler that is not even a function as a violation', () => {
    expect(violationsOf([{ route: '/api/odd', method: 'GET', handler: 'not a handler' }])).toEqual([
      'GET /api/odd: not created through defineRoute',
    ]);
  });

  it('refuses an admin route whose permission list is empty, since that names nobody', () => {
    const { handler } = {
      handler: Object.assign(() => undefined, {
        [Symbol.for('securedesk.route-meta')]: {
          name: 'x',
          auth: { stages: ['FULLY_AUTHENTICATED'], permission: [] },
        },
      }),
    };

    expect(violationsOf([{ route: '/api/admin/x', method: 'GET', handler }])).toEqual([
      'GET /api/admin/x: admin route without a permission',
    ]);
  });
});
