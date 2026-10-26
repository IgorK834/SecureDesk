import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sessionCookie } from '../../../../../server/auth/cookie';
import { completeTotpChallenge } from '../../../../../server/auth/totp-service';
import { db } from '../../../../../server/db/client';
import { defineRoute } from '../../../../../server/http/route-handler';
import { csrfCookie } from '../../../../../server/security/csrf';
import { toProfile } from '../../../../../server/users/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();

export const POST = defineRoute({
  name: 'auth.totp.challenge',
  auth: { stages: ['TOTP_CHALLENGE'] },
  body: Body,
  handler: async ({ session, body }) => {
    const created = await completeTotpChallenge(db, session.session, body.code);
    const response = NextResponse.json(
      { user: toProfile(session.user), authStage: 'FULLY_AUTHENTICATED' as const },
      { headers: { 'Cache-Control': 'no-store' } },
    );
    response.cookies.set(sessionCookie(created.token, created.session.expiresAt));
    response.cookies.set(csrfCookie(created.session.id, created.session.expiresAt));
    return response;
  },
});
