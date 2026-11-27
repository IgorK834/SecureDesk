import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';
import {
  authenticateCanaryWebhook,
  CanaryWebhookBody,
  receiveCanaryWebhook,
} from '../../../../../server/security/canary-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'webhooks.canarytokens.receive',
  auth: 'public',
  csrf: 'webhook',
  authenticateWebhook: authenticateCanaryWebhook,
  body: CanaryWebhookBody,
  handler: ({ body, requestId }) => {
    receiveCanaryWebhook(db, body, requestId);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
