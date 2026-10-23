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
 * columns changed. Nothing here has to be re-read to merge, so two changes cannot lose each other.
 *
 * The caller has validated `patch` (`SecuritySettingsPatch`). The database still refuses a length
 * below 12, so even a bug above this function cannot weaken the password rule.
 */
export function updateSecuritySettings(
  db: AppDb,
  adminId: string,
  patch: SecuritySettingsPatchInput,
): SecuritySettings {
  return db.transaction(
    (tx) => {
      // `updated_at` is not named here: the table stamps it on insert and on every update.
      const changed = { ...patch, updatedBy: adminId };
      tx.insert(securitySettings)
        .values({ ...DEFAULT_SECURITY_SETTINGS, ...changed, id: 1 })
        .onConflictDoUpdate({ target: securitySettings.id, set: changed })
        .run();
      return readSecuritySettings(tx);
    },
    { behavior: 'immediate' },
  );
}
