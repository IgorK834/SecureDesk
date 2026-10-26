import { z } from 'zod';
import { disableTotp } from '../../../../../server/auth/totp-service';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const POST = defineRoute({
  name: 'auth.totp.disable',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  body: Body,
  handler: async ({ session, body }) => {
    await disableTotp(db, session.session, body.currentPassword, body.code);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
