import { NextResponse } from 'next/server';
import { AUTH_STAGES } from '../../../../server/db/schema';
import { defineRoute } from '../../../../server/http/route-handler';
import { toProfile } from '../../../../server/users/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Who is signed in. Open to every stage, so the client learns that a password change is still
 * owed (`authStage`, `mustChangePassword`) instead of seeing a bare 403. It needs no permission:
 * every signed-in user may read their own profile. The Angular app calls this once at start-up,
 * not on a timer: every call counts as activity and would keep an idle session alive.
 */
export const GET = defineRoute({
  name: 'auth.me',
  auth: { stages: AUTH_STAGES },
  handler: ({ session: { session, user, permissions } }) =>
    NextResponse.json(
      {
        user: toProfile(user),
        authStage: session.authStage,
        mustChangePassword: user.mustChangePassword,
        permissions,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    ),
});
