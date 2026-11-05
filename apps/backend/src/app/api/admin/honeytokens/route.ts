import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { listHoneytokens } from '../../../../server/security/honeytoken-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.honeytokens.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.HONEYTOKENS_READ },
  handler: () => noStoreJson({ items: listHoneytokens(db) }),
});
