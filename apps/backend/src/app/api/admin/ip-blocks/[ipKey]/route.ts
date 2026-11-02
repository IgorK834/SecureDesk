import { z } from 'zod';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';
import { clearAddressBlock } from '../../../../../server/security/ip-block-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const IpBlockParams = z.object({ ipKey: z.string().min(1).max(100) }).strict();

export const DELETE = defineRoute({
  name: 'admin.ip_blocks.clear',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.IP_BLOCKS_CLEAR },
  params: IpBlockParams,
  handler: ({ requestId, session, params }) => {
    clearAddressBlock(db, params.ipKey, { adminId: session.user.id, requestId });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
