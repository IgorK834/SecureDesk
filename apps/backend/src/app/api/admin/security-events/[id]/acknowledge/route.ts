import { db } from '../../../../../../server/db/client';
import { noStoreJson } from '../../../../../../server/http/respond';
import { defineRoute } from '../../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../../server/permissions/codes';
import {
  SecurityEventParams,
  acknowledgeSecurityEvent,
} from '../../../../../../server/security/event-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'admin.security_events.acknowledge',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_EVENTS_ACKNOWLEDGE },
  params: SecurityEventParams,
  handler: ({ params, session }) =>
    noStoreJson(acknowledgeSecurityEvent(db, params.id, session.user.id)),
});
