import { z } from 'zod';
import { beginTotpEnrollment } from '../../../../../server/auth/totp-service';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';
import { noStoreJson } from '../../../../../server/http/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = defineRoute({
  name: 'auth.totp.enroll',
  auth: { stages: ['FULLY_AUTHENTICATED'] },
  body: z.object({}).strict(),
  handler: ({ session }) => noStoreJson(beginTotpEnrollment(db, session.session)),
});
