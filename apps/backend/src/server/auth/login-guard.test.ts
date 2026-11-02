import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMigratedDb } from '../db/__fixtures__/test-db';
import { CaptchaFailedError } from '../http/errors';
import { LOGIN_GUARD_STAGES, LOGIN_GUARD_STAGE_ORDER, runLoginGuard } from './login-guard';

const context = {
  ip: '203.0.113.7',
  normalizedLogin: 'employee1',
  userAgent: 'vitest',
  requestId: 'request-id',
  now: new Date('2026-03-10T12:00:00.000Z'),
};

afterEach(() => vi.restoreAllMocks());

describe('login guard pipeline', () => {
  it('runs every stage in the fixed documented order', async () => {
    const calls: string[] = [];
    for (const stage of LOGIN_GUARD_STAGES) {
      vi.spyOn(stage, 'run').mockImplementation(() => {
        calls.push(stage.name);
        return stage.name === 'accountLock'
          ? { status: 'continue', attemptId: 'attempt-id' }
          : { status: 'continue' };
      });
    }

    await expect(
      runLoginGuard(context, {
        db: createMigratedDb(),
        maxAttempts: 5,
        ipFailedAttemptLimit: 20,
      }),
    ).resolves.toStrictEqual({ status: 'reserved', attemptId: 'attempt-id' });
    expect(calls).toStrictEqual(LOGIN_GUARD_STAGE_ORDER);
  });

  it('does not run honeytoken or account-lock stages after CAPTCHA refuses the attempt', async () => {
    const captcha = LOGIN_GUARD_STAGES.find((stage) => stage.name === 'captcha');
    const honeytoken = LOGIN_GUARD_STAGES.find((stage) => stage.name === 'honeytoken');
    const accountLock = LOGIN_GUARD_STAGES.find((stage) => stage.name === 'accountLock');
    if (!captcha || !honeytoken || !accountLock) throw new Error('guard stage is missing');
    vi.spyOn(captcha, 'run').mockReturnValue({
      status: 'refused',
      error: new CaptchaFailedError(),
    });
    const honeytokenRun = vi.spyOn(honeytoken, 'run');
    const accountLockRun = vi.spyOn(accountLock, 'run');

    const result = await runLoginGuard(context, {
      db: createMigratedDb(),
      maxAttempts: 5,
      ipFailedAttemptLimit: 20,
    });

    expect(result).toMatchObject({
      status: 'refused',
      error: { status: 403, code: 'CAPTCHA_FAILED' },
    });
    expect(honeytokenRun).not.toHaveBeenCalled();
    expect(accountLockRun).not.toHaveBeenCalled();
  });
});
