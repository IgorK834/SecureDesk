import type { AppTransaction } from '../connection';
import { honeytokens } from '../schema';

export const ACCOUNT_TRAP_ID = 'account-trap-backup-admin';
export const ACCOUNT_TRAP_LOGIN = 'backup_admin';
export const ACCOUNT_TRAP_ALERT_ENV = 'CANARY_ACCOUNT_TRAP_URL';
export const AWS_DECOY_ID = 'decoy-aws-keys';

/** Registers the decoy account without creating a user or a credential. */
export function seedHoneytokens(tx: AppTransaction): void {
  tx.insert(honeytokens)
    .values({
      id: ACCOUNT_TRAP_ID,
      kind: 'ACCOUNT_TRAP',
      label: 'Backup administrator account',
      loginNormalized: ACCOUNT_TRAP_LOGIN,
      alertUrlEnv: ACCOUNT_TRAP_ALERT_ENV,
    })
    .onConflictDoNothing()
    .run();
  tx.insert(honeytokens)
    .values({
      id: AWS_DECOY_ID,
      kind: 'AWS_KEYS',
      label: 'Backup AWS credentials',
    })
    .onConflictDoNothing()
    .run();
}
