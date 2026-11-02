import { and, eq, gt, sql } from 'drizzle-orm';
import { revokeAllForUser } from '../auth/session-service';
import type { AppDb, AppTransaction } from '../db/connection';
import { type LoginAttemptKind, loginAttempts } from '../db/schema';
import { recordAggregated, recordSecurityEvent, recordSecurityEventOncePerBucket } from './events';

export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const ACCOUNT_LOCK_WINDOW_MS = ATTEMPT_WINDOW_MS;

interface ActiveAttempt {
  id: string;
  sequence: number;
  loginNormalized: string | null;
  kind: LoginAttemptKind;
  outcome: string;
  occurredAt: Date;
  ipKey: string;
}

type AttemptReader = Pick<AppDb, 'select'> | AppTransaction;

function selectedAttempts(db: AttemptReader, condition: ReturnType<typeof eq>, now: Date) {
  const cutoff = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  return db
    .select({
      id: loginAttempts.id,
      sequence: sql<number>`rowid`,
      loginNormalized: loginAttempts.loginNormalized,
      kind: loginAttempts.kind,
      outcome: loginAttempts.outcome,
      occurredAt: loginAttempts.occurredAt,
      ipKey: loginAttempts.ipKey,
    })
    .from(loginAttempts)
    .where(and(condition, gt(loginAttempts.occurredAt, cutoff)))
    .orderBy(sql`rowid`)
    .all();
}

const rowsForLogin = (db: AttemptReader, loginNormalized: string, now: Date) =>
  selectedAttempts(db, eq(loginAttempts.loginNormalized, loginNormalized), now);

const rowsForIp = (db: AttemptReader, ipKey: string, now: Date) =>
  selectedAttempts(db, eq(loginAttempts.ipKey, ipKey), now);

function afterLastKindReset(rows: ActiveAttempt[], kind: 'CREDENTIAL' | 'PASSWORD_CHANGE') {
  let resetSequence = 0;
  for (const row of rows) {
    const successful = row.kind === kind && row.outcome === 'SUCCESS';
    const accountCleared =
      kind === 'CREDENTIAL' && row.kind === 'MARKER' && row.outcome === 'CLEARED';
    if (successful || accountCleared) resetSequence = row.sequence;
  }
  return rows.filter((row) => row.sequence > resetSequence && row.kind === kind);
}

function afterLastIpClear(rows: ActiveAttempt[]) {
  let resetSequence = 0;
  for (const row of rows) {
    if (row.kind === 'MARKER' && row.outcome === 'CLEARED' && row.loginNormalized === null) {
      resetSequence = row.sequence;
    }
  }
  return rows.filter((row) => row.sequence > resetSequence);
}

function active(rows: ActiveAttempt[]) {
  return rows.filter((row) => row.outcome === 'PENDING' || row.outcome === 'FAILED');
}

function lockedUntil(rows: ActiveAttempt[], limit: number): Date | undefined {
  const threshold = rows[limit - 1];
  return threshold ? new Date(threshold.occurredAt.getTime() + ATTEMPT_WINDOW_MS) : undefined;
}

export interface CredentialAttemptInput {
  loginNormalized: string;
  ipKey: string;
  now: Date;
  maxAttempts: number;
}

export type CredentialAttemptReservation =
  { status: 'reserved'; attemptId: string } | { status: 'locked'; lockedUntil: Date };

export interface ResolveAttemptContext {
  now: Date;
  maxAttempts: number;
  requestId: string;
  userAgent?: string | null;
  sprayingDistinctLoginThreshold?: number;
}

/** Current account lock, including pending reservations that already exhaust the budget. */
export function accountLockedUntil(
  db: AttemptReader,
  loginNormalized: string,
  now: Date,
  maxAttempts: number,
): Date | undefined {
  return lockedUntil(
    active(afterLastKindReset(rowsForLogin(db, loginNormalized, now), 'CREDENTIAL')),
    maxAttempts,
  );
}

/** Atomically reserves one login credential verification. */
export function reserveCredentialAttempt(
  db: AppDb,
  input: CredentialAttemptInput,
): CredentialAttemptReservation {
  return db.transaction(
    (tx) => {
      const until = accountLockedUntil(tx, input.loginNormalized, input.now, input.maxAttempts);
      if (until) return { status: 'locked' as const, lockedUntil: until };

      const [attempt] = tx
        .insert(loginAttempts)
        .values({
          loginNormalized: input.loginNormalized,
          ipKey: input.ipKey,
          kind: 'CREDENTIAL',
          outcome: 'PENDING',
          occurredAt: input.now,
        })
        .returning({ id: loginAttempts.id })
        .all();
      if (!attempt) throw new Error('credential-attempt reservation was not inserted');
      return { status: 'reserved' as const, attemptId: attempt.id };
    },
    { behavior: 'immediate' },
  );
}

/** Resolves one login reservation and emits account-lock and spraying transitions. */
export function resolveAttempt(
  db: AppDb,
  attemptId: string,
  outcome: 'FAILED' | 'SUCCESS',
  ctx: ResolveAttemptContext,
): { lockedUntil?: Date } {
  const result = db.transaction<{
    lockedUntil?: Date;
    accountTransitioned?: boolean;
    distinctLogins?: number;
    loginNormalized?: string;
    ipKey?: string;
  }>(
    (tx) => {
      const attempt = tx.select().from(loginAttempts).where(eq(loginAttempts.id, attemptId)).get();
      if (
        !attempt ||
        attempt.loginNormalized === null ||
        attempt.kind !== 'CREDENTIAL' ||
        attempt.outcome !== 'PENDING'
      ) {
        throw new Error('credential-attempt reservation is missing or already resolved');
      }

      tx.update(loginAttempts)
        .set({ outcome, resolvedAt: ctx.now })
        .where(eq(loginAttempts.id, attemptId))
        .run();
      if (outcome === 'SUCCESS') return {};

      const failures = afterLastKindReset(
        rowsForLogin(tx, attempt.loginNormalized, ctx.now),
        'CREDENTIAL',
      ).filter((row) => row.outcome === 'FAILED');
      const until = lockedUntil(failures, ctx.maxAttempts);

      const ipFailures = afterLastIpClear(rowsForIp(tx, attempt.ipKey, ctx.now)).filter(
        (row) => row.kind === 'CREDENTIAL' && row.outcome === 'FAILED',
      );
      const distinctLogins = new Set(
        ipFailures.flatMap((row) => (row.loginNormalized === null ? [] : [row.loginNormalized])),
      ).size;

      return {
        ...(until && { lockedUntil: until }),
        accountTransitioned: failures.length === ctx.maxAttempts,
        distinctLogins,
        loginNormalized: attempt.loginNormalized,
        ipKey: attempt.ipKey,
      };
    },
    { behavior: 'immediate' },
  );

  if (result.lockedUntil && result.accountTransitioned) {
    recordSecurityEvent(db, {
      type: 'ACCOUNT_LOCKED',
      requestId: ctx.requestId,
      ipKey: result.ipKey,
      userAgent: ctx.userAgent,
      loginNormalized: result.loginNormalized,
      details: { attempts: ctx.maxAttempts, lockedUntil: result.lockedUntil.toISOString() },
    });
  }

  const sprayingThreshold = ctx.sprayingDistinctLoginThreshold;
  if (sprayingThreshold !== undefined && (result.distinctLogins ?? 0) >= sprayingThreshold) {
    recordSecurityEventOncePerBucket(db, {
      type: 'PASSWORD_SPRAYING_SUSPECTED',
      requestId: ctx.requestId,
      ipKey: result.ipKey,
      userAgent: ctx.userAgent,
      loginNormalized: result.loginNormalized,
      details: { distinctLogins: result.distinctLogins as number, threshold: sprayingThreshold },
    });
  }
  return result.lockedUntil ? { lockedUntil: result.lockedUntil } : {};
}

export interface IpBlockCheckInput {
  ipKey: string;
  now: Date;
  limit: number;
  requestId: string;
  userAgent?: string | null;
}

export interface IpBlock {
  ipKey: string;
  failedAttempts: number;
  lockedUntil: Date;
}

function ipBlockFromRows(ipKey: string, rows: ActiveAttempt[], limit: number): IpBlock | undefined {
  const failures = active(afterLastIpClear(rows));
  const until = lockedUntil(failures, limit);
  return until ? { ipKey, failedAttempts: failures.length, lockedUntil: until } : undefined;
}

/** Refuses an address after `limit` prior failed or pending attempts of any kind. */
export function checkIpBlock(db: AppDb, input: IpBlockCheckInput): IpBlock | undefined {
  const blocked = ipBlockFromRows(input.ipKey, rowsForIp(db, input.ipKey, input.now), input.limit);
  if (blocked) {
    recordAggregated(db, {
      type: 'LOGIN_IP_BLOCKED',
      requestId: input.requestId,
      ipKey: input.ipKey,
      userAgent: input.userAgent,
      details: { limit: input.limit },
    });
  }
  return blocked;
}

/** Lists every address whose current persistent window has exhausted the configured limit. */
export function listIpBlocks(db: AttemptReader, now: Date, limit: number): IpBlock[] {
  const cutoff = new Date(now.getTime() - ATTEMPT_WINDOW_MS);
  const rows = db
    .select({ ipKey: loginAttempts.ipKey })
    .from(loginAttempts)
    .where(gt(loginAttempts.occurredAt, cutoff))
    .all();
  const keys = [...new Set(rows.map((row) => row.ipKey))];
  return keys
    .flatMap((ipKey) => {
      const blocked = ipBlockFromRows(ipKey, rowsForIp(db, ipKey, now), limit);
      return blocked ? [blocked] : [];
    })
    .sort((a, b) => a.ipKey.localeCompare(b.ipKey));
}

/** Shared insertion point for future CAPTCHA and honeypot stages. */
export function recordIpFailure(
  db: AppDb,
  input: { ipKey: string; kind: 'CAPTCHA' | 'HONEYPOT'; now: Date },
): void {
  db.insert(loginAttempts)
    .values({
      loginNormalized: null,
      ipKey: input.ipKey,
      kind: input.kind,
      outcome: 'FAILED',
      occurredAt: input.now,
      resolvedAt: input.now,
    })
    .run();
}

/** Appends an administrator account reset marker without deleting the audit history. */
export function clearAccount(db: Pick<AppDb, 'insert'>, loginNormalized: string, now: Date): void {
  db.insert(loginAttempts)
    .values({
      loginNormalized,
      ipKey: 'local-admin',
      kind: 'MARKER',
      outcome: 'CLEARED',
      occurredAt: now,
      resolvedAt: now,
    })
    .run();
}

/** Appends an IP-level reset marker. Repeating the operation is intentionally harmless. */
export function clearIpBlock(db: Pick<AppDb, 'insert'>, ipKey: string, now: Date): void {
  db.insert(loginAttempts)
    .values({
      loginNormalized: null,
      ipKey,
      kind: 'MARKER',
      outcome: 'CLEARED',
      occurredAt: now,
      resolvedAt: now,
    })
    .run();
}

export interface PasswordChangeAttemptInput {
  loginNormalized: string;
  ipKey: string;
  now: Date;
  maxAttempts: number;
}

export function reservePasswordChangeAttempt(
  db: AppDb,
  input: PasswordChangeAttemptInput,
): CredentialAttemptReservation {
  return db.transaction(
    (tx) => {
      const attempts = active(
        afterLastKindReset(rowsForLogin(tx, input.loginNormalized, input.now), 'PASSWORD_CHANGE'),
      );
      const until = lockedUntil(attempts, input.maxAttempts);
      if (until) return { status: 'locked' as const, lockedUntil: until };

      const [attempt] = tx
        .insert(loginAttempts)
        .values({
          loginNormalized: input.loginNormalized,
          ipKey: input.ipKey,
          kind: 'PASSWORD_CHANGE',
          outcome: 'PENDING',
          occurredAt: input.now,
        })
        .returning({ id: loginAttempts.id })
        .all();
      if (!attempt) throw new Error('password-change reservation was not inserted');
      return { status: 'reserved' as const, attemptId: attempt.id };
    },
    { behavior: 'immediate' },
  );
}

export interface ResolvePasswordChangeContext {
  now: Date;
  maxAttempts: number;
  requestId: string;
  userId: string;
  userAgent?: string | null;
}

export function resolvePasswordChangeAttempt(
  db: AppDb,
  attemptId: string,
  outcome: 'FAILED' | 'SUCCESS',
  ctx: ResolvePasswordChangeContext,
): { lockedUntil?: Date } {
  const result = db.transaction<{
    lockedUntil?: Date;
    transitioned?: boolean;
    loginNormalized?: string;
    ipKey?: string;
  }>(
    (tx) => {
      const attempt = tx.select().from(loginAttempts).where(eq(loginAttempts.id, attemptId)).get();
      if (
        !attempt ||
        attempt.loginNormalized === null ||
        attempt.kind !== 'PASSWORD_CHANGE' ||
        attempt.outcome !== 'PENDING'
      ) {
        throw new Error('password-change reservation is missing or already resolved');
      }

      tx.update(loginAttempts)
        .set({ outcome, resolvedAt: ctx.now })
        .where(eq(loginAttempts.id, attemptId))
        .run();
      if (outcome === 'SUCCESS') return {};

      const failures = afterLastKindReset(
        rowsForLogin(tx, attempt.loginNormalized, ctx.now),
        'PASSWORD_CHANGE',
      ).filter((row) => row.outcome === 'FAILED');
      const until = lockedUntil(failures, ctx.maxAttempts);
      const transitioned = failures.length === ctx.maxAttempts;
      if (transitioned) revokeAllForUser(tx, ctx.userId);
      return {
        ...(until && { lockedUntil: until }),
        transitioned,
        loginNormalized: attempt.loginNormalized,
        ipKey: attempt.ipKey,
      };
    },
    { behavior: 'immediate' },
  );

  if (result.lockedUntil && result.transitioned) {
    recordSecurityEvent(db, {
      type: 'CHANGE_PASSWORD_BRUTE_FORCE',
      requestId: ctx.requestId,
      ipKey: result.ipKey,
      userAgent: ctx.userAgent,
      loginNormalized: result.loginNormalized,
      userId: ctx.userId,
      details: { failures: ctx.maxAttempts },
    });
  }
  return result.lockedUntil ? { lockedUntil: result.lockedUntil } : {};
}
