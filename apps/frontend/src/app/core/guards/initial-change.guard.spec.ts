// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { meResponse, runGuard } from '../../__fixtures__/session';
import { initialChangeGuard } from './initial-change.guard';

describe('initialChangeGuard', () => {
  it('allows only the initial password-change stage', async () => {
    await expect(
      runGuard(initialChangeGuard, { me: meResponse('EMPLOYEE', 'INITIAL_PASSWORD_CHANGE') }),
    ).resolves.toBe(true);
  });

  it('sends a fully authenticated user to the dashboard', async () => {
    await expect(runGuard(initialChangeGuard, { me: meResponse('EMPLOYEE') })).resolves.toBe(
      '/dashboard',
    );
  });

  it('sends an expired-password session to its permitted change page', async () => {
    await expect(
      runGuard(initialChangeGuard, { me: meResponse('EMPLOYEE', 'PASSWORD_EXPIRED') }),
    ).resolves.toBe('/account/change-password');
  });

  it('sends an anonymous visitor to login', async () => {
    await expect(runGuard(initialChangeGuard, { me: null })).resolves.toBe('/login');
  });
});
