import { NextResponse } from 'next/server';
import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';
import { softDeleteUser } from '../../../../../server/users/account-service';
import { UpdateUserBody, UserParams } from '../../../../../server/users/schemas';
import { getUser } from '../../../../../server/users/user-queries';
import { updateUser } from '../../../../../server/users/user-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One account as an `AdminUserDto`. A soft-deleted account answers like one that never existed. */
export const GET = defineRoute({
  name: 'admin.users.get',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  params: UserParams,
  handler: ({ params }) => noStoreJson(getUser(db, params.id)),
});

/**
 * Edits the first name, last name and/or role. The body is a strict allowlist: naming any other
 * field (`login`, `isBlocked`, `passwordHash`, `role_id`, `deletedAt`, ...) is a 400, so a
 * privileged column cannot be reached by listing it. Blocking, deleting and password resets have
 * their own endpoints and permissions.
 */
export const PATCH = defineRoute({
  name: 'admin.users.update',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_UPDATE },
  params: UserParams,
  body: UpdateUserBody,
  handler: ({ params, body }) => noStoreJson(updateUser(db, params.id, body)),
});

/**
 * Soft-deletes the account: it disappears from lists, can no longer sign in and loses every live
 * session, while the row (and so every ticket that points at it) stays. Repeating it is a 204.
 */
export const DELETE = defineRoute({
  name: 'admin.users.delete',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_DELETE },
  params: UserParams,
  handler: ({ params }) => {
    softDeleteUser(db, params.id);
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  },
});
