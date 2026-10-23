// Fixture: a route that opted out of authentication but is not on the allowlist. The scan must
// flag it, so a new public endpoint needs a deliberate, reviewed change to the allowlist.
import { defineRoute } from '../../../../apps/backend/src/server/http/route-handler';

export const POST = defineRoute({
  name: 'fixture.public_secret',
  auth: 'public',
  handler: () => new Response('ok'),
});
