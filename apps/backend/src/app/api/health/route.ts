import { defineRoute } from '../../../server/http/route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Public on purpose (a load balancer has no session) and on the conformance test's allowlist.
export const GET = defineRoute({
  name: 'health',
  auth: 'public',
  handler: () => Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } }),
});
