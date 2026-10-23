// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { meResponse, runGuard } from '../../__fixtures__/session';
import { guestOnlyGuard } from './guest-only.guard';

describe('guestOnlyGuard', () => {
  it('lets nobody-in-particular see the login page', async () => {
    await expect(runGuard(guestOnlyGuard, { me: null, url: '/login' })).resolves.toBe(true);
  });

  it.each(['FULLY_AUTHENTICATED', 'INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'] as const)(
    'sends a user in stage %s away from /login to the dashboard',
    async (stage) => {
      const me = meResponse('MANAGER', stage);

      await expect(runGuard(guestOnlyGuard, { me, url: '/login' })).resolves.toBe('/dashboard');
    },
  );
});
