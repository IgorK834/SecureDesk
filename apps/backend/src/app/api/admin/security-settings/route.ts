import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { SecuritySettingsPatch } from '../../../../server/security/schemas';
import {
  getSecuritySettings,
  updateSecuritySettings,
} from '../../../../server/security/settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The four global security settings as they are now. Administrator only. */
export const GET = defineRoute({
  name: 'admin.security_settings.get',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_SETTINGS_READ },
  handler: () => noStoreJson(getSecuritySettings(db)),
});

/**
 * Changes any non-empty subset of the settings and answers with all four. The body is a strict
 * allowlist, and the minimum password length cannot go below 12 (Zod here, a CHECK in the
 * database). Nothing is cached: the next request already sees the new values, so a shorter idle
 * timeout also applies to sessions that are open right now.
 */
export const PATCH = defineRoute({
  name: 'admin.security_settings.update',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_SETTINGS_UPDATE },
  body: SecuritySettingsPatch,
  handler: ({ session, body }) => noStoreJson(updateSecuritySettings(db, session.user.id, body)),
});
