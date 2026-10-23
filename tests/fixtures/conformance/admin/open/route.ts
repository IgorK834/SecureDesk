// Fixture: an admin route that checks the session but names no permission, so any signed-in user
// (a Guest included) could call it. The scan must flag it.
import { defineRoute } from '../../../../../apps/backend/src/server/http/route-handler';

export const GET = defineRoute({
  name: 'fixture.admin_open',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  handler: () => new Response('ok'),
});
