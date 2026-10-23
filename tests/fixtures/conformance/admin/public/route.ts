// Fixture: an admin route that is public. Flagged twice over: no permission, and not allowlisted.
import { defineRoute } from '../../../../../apps/backend/src/server/http/route-handler';

export const GET = defineRoute({
  name: 'fixture.admin_public',
  auth: 'public',
  handler: () => new Response('ok'),
});
