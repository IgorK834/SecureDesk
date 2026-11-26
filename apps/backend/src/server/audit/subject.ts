import { createHmac } from 'node:crypto';
import { ACCOUNT_TRAP_LOGIN } from '../db/seeds/honeytokens';

const PLACEHOLDER = /^(?:replace|change[\s_-]*me|your[\s_-]|placeholder|example|dummy)/i;
const LOCAL_PEPPER = 'securedesk-local-development-audit-subject';

function subjectPepper(env: NodeJS.ProcessEnv): string {
  const pepper = env.AUDIT_SUBJECT_PEPPER?.trim();
  if (pepper && pepper !== LOCAL_PEPPER && !PLACEHOLDER.test(pepper)) return pepper;
  if (env.NODE_ENV === 'production') {
    throw new Error('Set AUDIT_SUBJECT_PEPPER to a random secret before starting in production.');
  }
  return LOCAL_PEPPER;
}

export function assertAuditSubjectConfig(env: NodeJS.ProcessEnv = process.env): void {
  subjectPepper(env);
}

export type AuditSubject =
  | { subjectLogin: string; subjectRef?: never }
  | {
      subjectRef: string;
      subjectLogin?: never;
    };

export function subjectFor(
  normalizedLogin: string,
  accountExists: boolean,
  env: NodeJS.ProcessEnv = process.env,
): AuditSubject {
  if (accountExists || normalizedLogin === ACCOUNT_TRAP_LOGIN) {
    return { subjectLogin: normalizedLogin };
  }
  const digest = createHmac('sha256', subjectPepper(env)).update(normalizedLogin).digest('hex');
  return { subjectRef: `ref:${digest.slice(0, 16)}` };
}
