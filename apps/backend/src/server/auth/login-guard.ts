import type { AppDb } from '../db/connection';
import { AccountLockedError, type ApiError, IpBlockedError } from '../http/errors';
import { checkIpBlock, reserveCredentialAttempt } from '../security/attempt-tracker';

export interface LoginAttemptContext {
  ip: string;
  normalizedLogin: string;
  userAgent: string | null;
  requestId: string;
  now: Date;
}

export const LOGIN_GUARD_STAGE_ORDER = [
  'honeypot',
  'ipBlock',
  'captcha',
  'honeytoken',
  'accountLock',
] as const;

export type LoginGuardStageName = (typeof LOGIN_GUARD_STAGE_ORDER)[number];
export type LoginGuardStageResult =
  { status: 'continue'; attemptId?: string } | { status: 'refused'; error: ApiError };

interface LoginGuardDependencies {
  db: AppDb;
  maxAttempts: number;
  ipFailedAttemptLimit: number;
}

export interface LoginGuardStage {
  name: LoginGuardStageName;
  run(
    context: LoginAttemptContext,
    dependencies: LoginGuardDependencies,
  ): LoginGuardStageResult | Promise<LoginGuardStageResult>;
}

const continueLogin = (): LoginGuardStageResult => ({ status: 'continue' });

/**
 * Fixed login-defence order. Unbuilt Module 2 defences are explicit pass-through stages, so each
 * can be implemented independently without changing the surrounding authentication flow.
 */
export const LOGIN_GUARD_STAGES: readonly LoginGuardStage[] = [
  { name: 'honeypot', run: continueLogin },
  {
    name: 'ipBlock',
    run: (context, { db, ipFailedAttemptLimit }) => {
      const blocked = checkIpBlock(db, {
        ipKey: context.ip,
        now: context.now,
        limit: ipFailedAttemptLimit,
        requestId: context.requestId,
        userAgent: context.userAgent,
      });
      if (!blocked) return continueLogin();
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((blocked.lockedUntil.getTime() - context.now.getTime()) / 1000),
      );
      return { status: 'refused', error: new IpBlockedError(retryAfterSeconds) };
    },
  },
  { name: 'captcha', run: continueLogin },
  { name: 'honeytoken', run: continueLogin },
  {
    name: 'accountLock',
    run: (context, { db, maxAttempts }) => {
      const reservation = reserveCredentialAttempt(db, {
        loginNormalized: context.normalizedLogin,
        ipKey: context.ip,
        now: context.now,
        maxAttempts,
      });
      if (reservation.status === 'reserved') {
        return { status: 'continue', attemptId: reservation.attemptId };
      }
      const retryAfterSeconds = Math.max(
        0,
        Math.ceil((reservation.lockedUntil.getTime() - context.now.getTime()) / 1000),
      );
      return {
        status: 'refused',
        error: new AccountLockedError(reservation.lockedUntil, retryAfterSeconds),
      };
    },
  },
];

export type LoginGuardResult =
  { status: 'reserved'; attemptId: string } | { status: 'refused'; error: ApiError };

export async function runLoginGuard(
  context: LoginAttemptContext,
  dependencies: LoginGuardDependencies,
): Promise<LoginGuardResult> {
  let attemptId: string | undefined;
  for (const stage of LOGIN_GUARD_STAGES) {
    const result = await stage.run(context, dependencies);
    if (result.status === 'refused') return result;
    attemptId = result.attemptId ?? attemptId;
  }
  if (!attemptId) throw new Error('login guard did not reserve a credential attempt');
  return { status: 'reserved', attemptId };
}
