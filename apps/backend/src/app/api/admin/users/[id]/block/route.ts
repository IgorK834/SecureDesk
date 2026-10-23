import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import { blockUser } from '../../../../../../server/users/account-service';
import { UserParams } from '../../../../../../server/users/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Blocks the account and ends all of its sessions, so it loses access on its next request. The
 * permanent ADMIN account answers 409 PROTECTED_ACCOUNT. Repeating it is not an error.
 */
export const POST = defineRoute({
  name: 'admin.users.block',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_BLOCK },
  params: UserParams,
  handler: ({ params }) => noStoreJson(blockUser(db, params.id)),
});
