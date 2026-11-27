import { db } from '../../../../server/db/client';
import { listDetectionRules } from '../../../../server/detection/engine';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.detection_rules.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.AUDIT_LOG_READ },
  handler: () => noStoreJson({ items: listDetectionRules(db) }),
});
