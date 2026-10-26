import { z } from 'zod';
import { resetTotpForUser } from '../../../../../../server/auth/totp-service';
import { db } from '../../../../../../server/db/client';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import { UserParams } from '../../../../../../server/users/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.users.reset_totp',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_RESET_TOTP },
  params: UserParams,
  body: z.object({}).strict(),
  handler: ({ params }) => {
    resetTotpForUser(db, params.id);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
