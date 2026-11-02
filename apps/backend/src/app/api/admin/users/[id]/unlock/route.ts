import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import { unlockUserLogin } from '../../../../../../server/users/account-service';
import { UserParams } from '../../../../../../server/users/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.users.unlock',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_UNLOCK },
  params: UserParams,
  handler: ({ requestId, session, params }) =>
    noStoreJson(unlockUserLogin(db, params.id, { adminId: session.user.id, requestId })),
});
