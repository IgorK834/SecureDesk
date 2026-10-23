import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import { unblockUser } from '../../../../../../server/users/account-service';
import { UserParams } from '../../../../../../server/users/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Lets the account sign in again. Sessions the block ended stay ended, and the password state is
 * not touched. Repeating it is not an error.
 */
export const POST = defineRoute({
  name: 'admin.users.unblock',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_BLOCK },
  params: UserParams,
  handler: ({ params }) => noStoreJson(unblockUser(db, params.id)),
});
