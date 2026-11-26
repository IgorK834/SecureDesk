import { verifyAndRecord } from '../../../../../server/audit/verification-record';
import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.audit_log.verify',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_VERIFY },
  handler: async ({ audit }) => noStoreJson(await verifyAndRecord(db, audit)),
});
