import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { SecurityEventsQuery, listSecurityEvents } from '../../../../server/security/event-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = defineRoute({
  name: 'admin.security_events.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.SECURITY_EVENTS_READ },
  query: SecurityEventsQuery,
  handler: ({ query }) => noStoreJson(listSecurityEvents(db, query)),
});
