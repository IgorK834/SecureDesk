import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { getIpBlocks } from '../../../../server/security/ip-block-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.ip_blocks.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.IP_BLOCKS_READ },
  handler: () => noStoreJson({ items: getIpBlocks(db) }),
});
