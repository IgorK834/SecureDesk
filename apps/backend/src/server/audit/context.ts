import { randomUUID } from 'node:crypto';
import type { AppDb, AppTransaction } from '../db/connection';
import type { AuditLogRow } from '../db/schema';
import { AuditUnavailableError } from '../http/errors';
import { logEvent } from '../security/log-event';
import { appendAuditEntry } from './append';
import type { AuditAction } from './events';
import type { AuditSubject } from './subject';

interface AuditIdentity {
  actorType: AuditLogRow['actorType'];
  actorUserId: string | null;
  actorLogin: string | null;
  ip: string | null;
  requestId: string;
}

interface AuditEvent {
  action: AuditAction;
  outcome: AuditLogRow['outcome'];
  details: unknown;
  subject?: AuditSubject;
}

export interface AuditContext extends Readonly<AuditIdentity> {
  /** Required by default. Use 'refusal' only to preserve a refusal already decided. */
  record(db: AppDb | AppTransaction, event: AuditEvent, policy?: 'refusal'): void;
}

function bindAudit(identity: AuditIdentity): AuditContext {
  return {
    ...identity,
    record(db, { action, outcome, details, subject }, policy) {
      try {
        appendAuditEntry(db, {
          ...identity,
          action,
          outcome,
          details,
          subjectLogin: subject?.subjectLogin,
          subjectRef: subject?.subjectRef,
        });
      } catch {
        if (policy !== 'refusal') throw new AuditUnavailableError();
        logEvent('audit.append.failure', identity.requestId);
      }
    },
  };
}

export function requestAudit(
  requestId: string,
  ip: string | null,
  user?: { id: string; login: string },
): AuditContext {
  return bindAudit({
    requestId,
    ip,
    actorType: user ? 'USER' : 'ANONYMOUS',
    actorUserId: user?.id ?? null,
    actorLogin: user?.login ?? null,
  });
}

export function systemAudit(
  requestId: string = randomUUID(),
  ip: string | null = null,
): AuditContext {
  return bindAudit({
    requestId,
    ip,
    actorType: 'SYSTEM',
    actorUserId: null,
    actorLogin: null,
  });
}
