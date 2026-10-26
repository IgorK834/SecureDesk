import { NextResponse } from 'next/server';
import { db } from '../../../../server/db/client';
import { AUTH_STAGES } from '../../../../server/db/schema';
import { defineRoute } from '../../../../server/http/route-handler';
import { readSecuritySettings } from '../../../../server/security/settings';
import { toProfile } from '../../../../server/users/mappers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Who is signed in. Open to every stage, so the client learns that a password change is still
 * owed (`authStage`, `mustChangePassword`) instead of seeing a bare 403. It needs no permission:
 * every signed-in user may read their own profile. It also carries the two password-policy values
 * the change-password screens show as hints (read now, so a changed setting shows up on the next
 * call); the other settings are not part of it. The Angular app calls this once at start-up,
 * not on a timer: every call counts as activity and would keep an idle session alive.
 */
export const GET = defineRoute({
  name: 'auth.me',
  auth: { stages: AUTH_STAGES },
  handler: ({ session: { session, user, permissions } }) => {
    const { minPasswordLength, rejectPersonalDataInPassword } = readSecuritySettings(db);
    return NextResponse.json(
      {
        user: toProfile(user),
        authStage: session.authStage,
        mustChangePassword: user.mustChangePassword,
        totpEnabled: user.totpEnabled,
        permissions,
        passwordPolicy: { minPasswordLength, rejectPersonalDataInPassword },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  },
});
