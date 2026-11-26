import { systemAudit, type AuditContext } from '../audit/context';
import type { AppDb } from '../db/connection';
import { securitySettings } from '../db/schema';
import type { SecuritySettingsPatchInput } from './schemas';
import { DEFAULT_SECURITY_SETTINGS, type SecuritySettings, readSecuritySettings } from './settings';

/**
 * What the administrator sees. It is the very function the session, login and password services
 * call when they enforce a setting, so the value shown is by construction the value in force, and
 * nothing is cached between calls.
 */
export const getSecuritySettings = readSecuritySettings;

/**
 * Applies the settings named in `patch` (the others keep their value) and records who changed
 * them and when. Returns the settings as they are now.
 *
 * One upsert statement: a database without the settings row, which reads as the defaults, gets
 * the row created with the defaults plus the patch, and a database with the row has only the named
 * columns changed. Read both versions under the write lock to record the effective changes.
 *
 * The caller has validated `patch` (`SecuritySettingsPatch`). The database still refuses a length
 * below 12, so even a bug above this function cannot weaken the password rule.
 */
export function updateSecuritySettings(
  db: AppDb,
  adminId: string,
  patch: SecuritySettingsPatchInput,
  audit: AuditContext = systemAudit(),
): SecuritySettings {
  return db.transaction(
    (tx) => {
      const before = readSecuritySettings(tx);
      // `updated_at` is not named here: the table stamps it on insert and on every update.
      const changed = { ...patch, updatedBy: adminId };
      tx.insert(securitySettings)
        .values({ ...DEFAULT_SECURITY_SETTINGS, ...changed, id: 1 })
        .onConflictDoUpdate({ target: securitySettings.id, set: changed })
        .run();
      const after = readSecuritySettings(tx);
      const changes = (Object.keys(patch) as (keyof SecuritySettings)[])
        .filter((key) => before[key] !== after[key])
        .map((key) => ({ key, from: before[key], to: after[key] }));
      if (changes.length) {
        audit.record(tx, { action: 'SETTINGS_CHANGED', outcome: 'SUCCESS', details: { changes } });
      }
      return after;
    },
    { behavior: 'immediate' },
  );
}
