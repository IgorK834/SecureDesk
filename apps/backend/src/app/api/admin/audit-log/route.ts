import { listAuditEntries } from '../../../../server/audit/queries';
import { AuditListQuery } from '../../../../server/audit/schemas';
import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.audit_log.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_READ },
  query: AuditListQuery,
  handler: ({ query, audit, session }) =>
    noStoreJson(listAuditEntries(db, query, audit, session.session.id)),
});
