import { exportAuditEntries } from '../../../../../server/audit/export';
import { AuditExportBody } from '../../../../../server/audit/schemas';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.audit_log.export',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_EXPORT },
  body: AuditExportBody,
  handler: ({ body, audit }) => exportAuditEntries(db, body, audit),
});
