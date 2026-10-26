// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { describe, expect, it } from 'vitest';
import { meResponse, runGuard } from '../../__fixtures__/session';
import { totpChallengeGuard } from './totp-challenge.guard';

describe('totpChallengeGuard', () => {
  it('allows only the TOTP challenge stage', async () => {
    await expect(
      runGuard(totpChallengeGuard, { me: meResponse('EMPLOYEE', 'TOTP_CHALLENGE') }),
    ).resolves.toBe(true);
  });

  it.each([
    [null, '/login'],
    ['FULLY_AUTHENTICATED' as const, '/dashboard'],
    ['INITIAL_PASSWORD_CHANGE' as const, '/change-initial-password'],
    ['PASSWORD_EXPIRED' as const, '/account/change-password'],
  ])('redirects stage %s to %s', async (stage, destination) => {
    const me = stage ? meResponse('EMPLOYEE', stage) : null;
    await expect(runGuard(totpChallengeGuard, { me })).resolves.toBe(destination);
  });
});
