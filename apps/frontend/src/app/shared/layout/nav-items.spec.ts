// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { loadAuth, meResponse } from '../../__fixtures__/session';
import { routes } from '../../app.routes';
import { permissionGuard } from '../../core/guards/permission.guard';
import { NAV_ITEMS, visibleNavItems } from './nav-items';

describe('visibleNavItems', () => {
  it('lists only what the role may use', async () => {
    const { auth } = await loadAuth(meResponse('GUEST'));

    expect(visibleNavItems(auth).map((item) => item.route)).toStrictEqual([
      '/tickets',
      '/tickets/new',
    ]);
  });

  it('lists nothing for nobody', async () => {
    const { auth } = await loadAuth(null);

    expect(visibleNavItems(auth)).toStrictEqual([]);
  });
});

describe('NAV_ITEMS', () => {
  it.each(NAV_ITEMS.map((item) => [item.label, item] as const))(
    'the "%s" link requires what its route requires, so it never leads to /forbidden',
    (_label, item) => {
      const route = routes.find((candidate) => `/${candidate.path}` === item.route);

      expect(route, `no route for ${item.route}`).toBeDefined();
      expect(route?.canActivate).toContain(permissionGuard);
      expect(route?.data?.['permission']).toStrictEqual(item.permission);
    },
  );
});
