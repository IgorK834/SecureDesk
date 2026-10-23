import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import { resetPassword } from '../../../../../../server/users/account-service';
import { ResetPasswordBody, UserParams } from '../../../../../../server/users/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Replaces the account's password with a fresh temporary one and ends all of its sessions. This
 * response is the only place the plaintext exists: it is not stored, not logged and not returned
 * again, so it is sent `no-store`. The body must be an empty JSON object: the administrator never
 * chooses the password, and a body that names anything is refused. A blocked account stays blocked.
 *
 * NOTE: like every state-changing route, this has no CSRF protection beyond SameSite=Lax on the
 * session cookie until SD-27 adds it. Requiring `application/json` already keeps a plain
 * cross-site form from driving it.
 */
export const POST = defineRoute({
  name: 'admin.users.reset_password',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_RESET_PASSWORD },
  params: UserParams,
  body: ResetPasswordBody,
  handler: async ({ params }) =>
    noStoreJson({ temporaryPassword: await resetPassword(db, params.id) }),
});
