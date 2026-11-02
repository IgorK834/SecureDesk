import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { recordSecurityEvent } from '../../../../server/security/events';
import { getClientIp } from '../../../../server/security/rate-limiter';
import { SecuritySettingsPatch } from '../../../../server/security/schemas';
import {
  getSecuritySettings,
  updateSecuritySettings,
} from '../../../../server/security/settings-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The eight global security settings as they are now. Administrator only. */
export const GET = defineRoute({
  name: 'admin.security_settings.get',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_SETTINGS_READ },
  handler: () => noStoreJson(getSecuritySettings(db)),
});

/**
 * Changes any non-empty subset of the settings and answers with all eight. The body is a strict
 * allowlist, and the minimum password length cannot go below 12 nor the login-protection settings
 * leave their ranges (Zod here, CHECK constraints in the database). Nothing is cached: the next
 * request already sees the new values, so a shorter idle timeout also applies to sessions that are
 * open right now, and a new failed-attempt limit to the next login. The change is recorded as a
 * `SECURITY_SETTINGS_CHANGED` event naming the keys and the administrator, never the values.
 */
export const PATCH = defineRoute({
  name: 'admin.security_settings.update',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_SETTINGS_UPDATE },
  body: SecuritySettingsPatch,
  handler: ({ request, requestId, session, body }) => {
    const settings = updateSecuritySettings(db, session.user.id, body);
    recordSecurityEvent(db, {
      type: 'SECURITY_SETTINGS_CHANGED',
      requestId,
      ipKey: getClientIp(request),
      userAgent: request.headers.get('user-agent'),
      userId: session.user.id,
      details: {
        adminId: session.user.id,
        changedKeys: Object.keys(body) as (keyof typeof body)[],
      },
    });
    return noStoreJson(settings);
  },
});
