import { getAuditEntry } from '../../../../../server/audit/queries';
import { AuditSeqParams } from '../../../../../server/audit/schemas';
import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.audit_log.detail',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_READ },
  params: AuditSeqParams,
  handler: ({ params, audit, session }) =>
    noStoreJson(getAuditEntry(db, params.seq, audit, session.session.id)),
});
