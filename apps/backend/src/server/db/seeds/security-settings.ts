import type { AppTransaction } from '../connection';
import { securitySettings } from '../schema';

/**
 * Creates the single settings row with the variant-2 defaults. An existing row is left alone,
 * so a re-run never undoes a change an administrator made.
 */
export function seedSecuritySettings(tx: AppTransaction): void {
  tx.insert(securitySettings)
    .values({
      id: 1,
      minPasswordLength: 12,
      rejectPersonalDataInPassword: false,
      passwordMaxAgeDays: null,
      sessionIdleTimeoutMinutes: 15,
    })
    .onConflictDoNothing()
    .run();
}
