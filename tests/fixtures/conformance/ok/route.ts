// Fixture: a conforming business route. The scan must accept it.
import { defineRoute } from '../../../../apps/backend/src/server/http/route-handler';

export const GET = defineRoute({
  name: 'fixture.ok',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  handler: () => new Response('ok'),
});
