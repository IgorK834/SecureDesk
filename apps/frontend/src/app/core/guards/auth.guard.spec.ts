// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { meResponse, runGuard } from '../../__fixtures__/session';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  it('sends nobody to /login', async () => {
    await expect(runGuard(authGuard, { me: null })).resolves.toBe('/login');
  });

  it('lets a fully authenticated user through', async () => {
    await expect(runGuard(authGuard, { me: meResponse('GUEST'), url: '/tickets' })).resolves.toBe(
      true,
    );
  });

  describe('a session that still owes the first password change', () => {
    const me = meResponse('EMPLOYEE', 'INITIAL_PASSWORD_CHANGE');

    it.each(['/dashboard', '/tickets/7', '/account/change-password', '/admin/users'])(
      'is forced from %s to /change-initial-password',
      async (url) => {
        await expect(runGuard(authGuard, { me, url })).resolves.toBe('/change-initial-password');
      },
    );

    it.each(['/change-initial-password', '/change-initial-password?from=login'])(
      'may stay on %s (no redirect loop)',
      async (url) => {
        await expect(runGuard(authGuard, { me, url })).resolves.toBe(true);
      },
    );
  });

  describe('a session whose password has expired', () => {
    const me = meResponse('MANAGER', 'PASSWORD_EXPIRED');

    it.each(['/dashboard', '/tickets', '/change-initial-password'])(
      'is forced from %s to /account/change-password',
      async (url) => {
        await expect(runGuard(authGuard, { me, url })).resolves.toBe('/account/change-password');
      },
    );

    it('may stay on /account/change-password', async () => {
      await expect(runGuard(authGuard, { me, url: '/account/change-password' })).resolves.toBe(
        true,
      );
    });
  });
});
