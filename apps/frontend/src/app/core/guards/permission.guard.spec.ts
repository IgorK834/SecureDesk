// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { executeGuard, loadAuth, meResponse, runGuard } from '../../__fixtures__/session';
import { READ_TICKETS } from '../auth/auth.models';
import { permissionGuard } from './permission.guard';

describe('permissionGuard', () => {
  it('lets a role through when it holds the permission the route declares', async () => {
    const outcome = await runGuard(permissionGuard, {
      me: meResponse('ADMINISTRATOR'),
      data: { permission: 'users:read' },
    });

    expect(outcome).toBe(true);
  });

  it('sends a role without the permission to /forbidden', async () => {
    const outcome = await runGuard(permissionGuard, {
      me: meResponse('GUEST'),
      data: { permission: 'users:read' },
    });

    expect(outcome).toBe('/forbidden');
  });

  it.each([
    ['GUEST', true],
    ['ADMINISTRATOR', '/forbidden'],
  ] as const)(
    'accepts any one permission of a list, as the ticket pages do: %s -> %s',
    async (role, expected) => {
      const outcome = await runGuard(permissionGuard, {
        me: meResponse(role),
        data: { permission: READ_TICKETS },
      });

      expect(outcome).toBe(expected);
    },
  );

  it.each([
    ['declares no permission at all', {}],
    ['declares an empty list', { permission: [] }],
  ])('denies by default when a route %s', async (_name, data) => {
    // A forgotten `data.permission` must close the page, never open it to everyone.
    const outcome = await runGuard(permissionGuard, { me: meResponse('ADMINISTRATOR'), data });

    expect(outcome).toBe('/forbidden');
  });

  it('denies a session that still owes a password change, whatever its role holds', async () => {
    const outcome = await runGuard(permissionGuard, {
      me: meResponse('ADMINISTRATOR', 'INITIAL_PASSWORD_CHANGE'),
      data: { permission: 'users:read' },
    });

    expect(outcome).toBe('/forbidden');
  });
});

// Why the backend, not these guards, is the security boundary (control question 4).
describe('route guards are a UX aid, not authorization', () => {
  it('trust whatever state the browser holds, so a tampered state opens the page — only the backend can still say no', async () => {
    // A Guest who edits their own browser state to claim `users:read`. The browser is the
    // user's: nothing in it can be trusted, so the guard cannot tell this from the real thing.
    const forged = meResponse('GUEST', 'FULLY_AUTHENTICATED', ['users:read']);
    const { meCall } = await loadAuth(forged);

    const outcome = executeGuard(permissionGuard, { data: { permission: 'users:read' } });

    expect(outcome).toBe(true);
    // The guard decided from local state alone: the only server call is the start-up
    // `/api/auth/me`, none was made to check this navigation.
    expect(meCall).toHaveBeenCalledTimes(1);
    // So the protection that counts is server-side: for the same Guest, GET /api/admin/users
    // is answered 403 from the permissions in the database, never from the browser's state
    // (tests/admin-routes-authz.test.ts).
  });
});
