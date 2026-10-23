// Fixture: a conforming admin route (a permission is named). The scan must accept it.
import { defineRoute } from '../../../../../apps/backend/src/server/http/route-handler';
import { PERMISSIONS } from '../../../../../apps/backend/src/server/permissions/codes';

export const GET = defineRoute({
  name: 'fixture.admin_ok',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  handler: () => new Response('ok'),
});
