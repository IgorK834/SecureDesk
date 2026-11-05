import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import {
  HoneytokenParams,
  testHoneytoken,
} from '../../../../../../server/security/honeytoken-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.honeytokens.test',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.HONEYTOKENS_TEST },
  params: HoneytokenParams,
  handler: ({ params, requestId, session }) =>
    noStoreJson(
      testHoneytoken(db, params.id, {
        requestId,
        administratorId: session.user.id,
      }),
      202,
    ),
});
