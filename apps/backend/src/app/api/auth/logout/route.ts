import { NextResponse } from 'next/server';
import { clearedSessionCookie } from '../../../../server/auth/cookie';
import { revokeSession } from '../../../../server/auth/session-service';
import { db } from '../../../../server/db/client';
import { AUTH_STAGES } from '../../../../server/db/schema';
import { defineRoute } from '../../../../server/http/route-handler';
import { logEvent } from '../../../../server/security/log-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Ends the caller's session: revoked in the database (so the token is dead even if it was copied)
 * and cleared in the browser. Open to every stage, so a user who must change the password can
 * still sign out. It needs no permission: every signed-in user may sign out.
 *
 * NOTE: a state-changing request normally also needs CSRF protection. That mechanism is owned
 * by SD-27 and does not exist yet; SameSite=Lax on the cookie is the only defense until then.
 */
export const POST = defineRoute({
  name: 'auth.logout',
  auth: { stages: AUTH_STAGES },
  handler: ({ requestId, session }) => {
    revokeSession(db, session.session.id);
    logEvent('auth.logout', requestId);

    const response = new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
    response.cookies.set(clearedSessionCookie());
    return response;
  },
});
