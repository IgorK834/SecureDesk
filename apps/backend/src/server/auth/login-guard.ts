import type { AppDb } from '../db/connection';
import { eq } from 'drizzle-orm';
import type { AuditContext } from '../audit/context';
import { getDummyHash, verifyPassword } from './password-hasher';
import { honeytokens } from '../db/schema';
import { AccountLockedError, ApiError, IpBlockedError, isCaptchaRefusal } from '../http/errors';
import {
  checkIpBlock,
  recordIpFailure,
  reserveCredentialAttempt,
} from '../security/attempt-tracker';
import { verifyCaptchaOrThrow } from '../security/captcha';
import { recordAggregated } from '../security/events';
import { triggerHoneytoken } from '../security/honeytokens';

export interface LoginAttemptContext {
  ip: string;
  normalizedLogin: string;
  userAgent: string | null;
  requestId: string;
  now: Date;
  captcha?: unknown;
  password: string;
  website?: string;
}

export const LOGIN_GUARD_STAGE_ORDER = [
  'honeypot',
  'ipBlock',
  'captcha',
  'honeytoken',
  'accountLock',
] as const;

export type LoginGuardStageName = (typeof LOGIN_GUARD_STAGE_ORDER)[number];
type LoginGuardRefusal = {
  status: 'refused';
  error: ApiError;
  reason: 'HONEYPOT' | 'IP_BLOCKED' | 'CAPTCHA_FAILED' | 'ACCOUNT_LOCKED';
};
export type LoginGuardStageResult = { status: 'continue'; attemptId?: string } | LoginGuardRefusal;

interface LoginGuardDependencies {
  db: AppDb;
  audit: AuditContext;
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
  {
    name: 'honeypot',
    run: async (context, { db }) => {
      if (!context.website) return continueLogin();
      await verifyPassword(await getDummyHash(), context.password);
      recordIpFailure(db, { ipKey: context.ip, kind: 'HONEYPOT', now: context.now });
      recordAggregated(db, {
        type: 'HONEYPOT_TRIGGERED',
        requestId: context.requestId,
        ipKey: context.ip,
        userAgent: context.userAgent,
        details: {},
      });
      return {
        status: 'refused',
        reason: 'HONEYPOT',
        error: new ApiError(401, 'AUTH_INVALID_CREDENTIALS', 'Login lub hasło niepoprawne'),
      };
    },
  },
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
      return {
        status: 'refused',
        reason: 'IP_BLOCKED',
        error: new IpBlockedError(retryAfterSeconds),
      };
    },
  },
  {
    name: 'captcha',
    run: async (context, { db }) => {
      try {
        await verifyCaptchaOrThrow(context.captcha, {
          db,
          purpose: 'login',
          ipKey: context.ip,
          now: context.now,
          requestId: context.requestId,
          userAgent: context.userAgent,
        });
      } catch (error) {
        if (!isCaptchaRefusal(error)) throw error;
        return { status: 'refused', error, reason: 'CAPTCHA_FAILED' };
      }
      return continueLogin();
    },
  },
  {
    name: 'honeytoken',
    run: (context, { db, audit }) => {
      const token = db
        .select()
        .from(honeytokens)
        .where(eq(honeytokens.loginNormalized, context.normalizedLogin))
        .get();
      if (token?.enabled) {
        triggerHoneytoken({
          tokenId: token.id,
          source: token.kind,
          ctx: {
            db,
            ipKey: context.ip,
            requestId: context.requestId,
            userAgent: context.userAgent,
            now: context.now,
          },
        });
        audit.record(
          db,
          {
            action: 'AUTH_TRAP_ACCOUNT_USED',
            outcome: 'FAILURE',
            details: { reason: 'TRAP_ACCOUNT' },
            subject: { subjectLogin: context.normalizedLogin },
          },
          'refusal',
        );
      }
      return continueLogin();
    },
  },
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
        reason: 'ACCOUNT_LOCKED',
        error: new AccountLockedError(reservation.lockedUntil, retryAfterSeconds),
      };
    },
  },
];

export type LoginGuardResult = { status: 'reserved'; attemptId: string } | LoginGuardRefusal;

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
