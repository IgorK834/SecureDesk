import { NextResponse } from 'next/server';
import { requireSession } from '../../../../server/auth/guards';
import { handleRoute } from '../../../../server/http/route';
import { toProfile } from '../../../../server/users/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Who is signed in. Open to every stage, so the client learns that a password change is still
 * owed (`authStage`, `mustChangePassword`) instead of seeing a bare 403. The Angular app calls
 * this once at start-up, not on a timer: every call counts as activity and would keep an idle
 * session alive.
 */
export const GET = handleRoute('auth.me', (request) => {
  const { session, user, permissions } = requireSession(request);
  return NextResponse.json(
    {
      user: toProfile(user),
      authStage: session.authStage,
      mustChangePassword: user.mustChangePassword,
      permissions,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
