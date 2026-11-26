import { latestAuditVerification } from '../../../../../server/audit/verification-record';
import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.audit_log.integrity',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_READ },
  handler: () => noStoreJson(latestAuditVerification(db)),
});
