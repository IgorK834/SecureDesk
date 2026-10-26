import { z } from 'zod';
import { confirmTotpEnrollment } from '../../../../../server/auth/totp-service';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export const POST = defineRoute({
  name: 'auth.totp.verify_enrollment',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  body: Body,
  handler: async ({ session, body }) => {
    await confirmTotpEnrollment(db, session.session, body.code);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
