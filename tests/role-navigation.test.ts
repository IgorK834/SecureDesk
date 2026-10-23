// Plain Vitest has no Angular compiler plugin: the JIT compiler is loaded for @Injectable.
import '@angular/compiler';
import { Injector } from '@angular/core';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS as FRONTEND_TEST_MATRIX } from '../apps/frontend/src/app/__fixtures__/session';
import { PERMISSION_CODES, READ_TICKETS } from '../apps/frontend/src/app/core/auth/auth.models';
import { AuthService } from '../apps/frontend/src/app/core/auth/auth.service';
import { ApiClient } from '../apps/frontend/src/app/core/http/api-client.service';
import { visibleNavItems } from '../apps/frontend/src/app/shared/layout/nav-items';
import { PERMISSIONS, ROLES } from '../apps/backend/src/server/permissions/codes';
import { ROLE_PERMISSIONS as BACKEND_MATRIX } from '../apps/backend/src/server/permissions/matrix';
import { READ_TICKETS as BACKEND_READ_TICKETS } from '../apps/backend/src/server/tickets/policy';

// Control question 4: hiding UI is not authorization. The Angular app still has to do it right,
// because it is what each role sees. This pins what Angular shows to the matrix the backend
// actually enforces (SD-12), instead of to a second hand-written copy of it in the frontend.

const sorted = (values: readonly string[]) => [...values].sort();

async function navigationFor(roleId: keyof typeof BACKEND_MATRIX): Promise<string[]> {
  const me = {
    user: { id: 'u1', login: roleId, firstName: 'A', lastName: 'B', role: roleId.toUpperCase() },
    authStage: 'FULLY_AUTHENTICATED',
    mustChangePassword: false,
    permissions: [...BACKEND_MATRIX[roleId]],
  };
  const injector = Injector.create({
    providers: [
      { provide: ApiClient, useValue: { me: () => of(me) }, deps: [] },
      { provide: AuthService, useClass: AuthService, deps: [] },
    ],
  });
  const auth = injector.get(AuthService);
  await auth.load();
  return visibleNavItems(auth).map((item) => item.route);
}

describe('the Angular app and the backend agree on the permission vocabulary', () => {
  it('knows exactly the permission codes the backend can grant', () => {
    expect(sorted(PERMISSION_CODES)).toStrictEqual(sorted(Object.values(PERMISSIONS)));
  });

  it('opens the ticket pages to the same permissions as the ticket API', () => {
    expect(sorted(READ_TICKETS)).toStrictEqual(sorted(BACKEND_READ_TICKETS));
  });

  it('uses test sessions that match the real role matrix, role for role', () => {
    expect(sorted(Object.keys(FRONTEND_TEST_MATRIX))).toStrictEqual(
      sorted(Object.values(ROLES).map((id) => id.toUpperCase())),
    );
    for (const roleId of Object.values(ROLES)) {
      expect(
        sorted(FRONTEND_TEST_MATRIX[roleId.toUpperCase() as keyof typeof FRONTEND_TEST_MATRIX]),
      ).toStrictEqual(sorted(BACKEND_MATRIX[roleId]));
    }
  });
});

describe('navigation per role, derived from the backend matrix', () => {
  it('gives the Administrator user administration and no ticket link', async () => {
    const routes = await navigationFor(ROLES.ADMINISTRATOR);

    expect(routes).toStrictEqual(['/admin/users', '/admin/security']);
    expect(routes.filter((route) => route.startsWith('/tickets'))).toStrictEqual([]);
  });

  it.each([ROLES.MANAGER, ROLES.EMPLOYEE, ROLES.GUEST])(
    'gives the %s the ticket links and no administration link',
    async (roleId) => {
      const routes = await navigationFor(roleId);

      expect(routes).toStrictEqual(['/tickets', '/tickets/new']);
      expect(routes.filter((route) => route.startsWith('/admin'))).toStrictEqual([]);
    },
  );
});
