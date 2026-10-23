import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../server/permissions/codes';
import { CreateUserBody, ListUsersQuery } from '../../../../server/users/schemas';
import { createUser } from '../../../../server/users/user-service';
import { listUsers } from '../../../../server/users/user-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A page of accounts, filtered by search text, role and status. Administrator only. Each item is
 * an `AdminUserDto`: no password hash, no session token, no soft-deleted account.
 */
export const GET = defineRoute({
  name: 'admin.users.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_READ },
  query: ListUsersQuery,
  handler: ({ query }) => {
    const { items, total } = listUsers(db, query);
    return noStoreJson({ items, page: query.page, pageSize: query.pageSize, total });
  },
});

/**
 * Creates an account with a role and a one-time temporary password. This response is the only
 * place the plaintext password ever exists: it is not stored, not logged and not returned again
 * (by `GET /api/admin/users/[id]` or anything else), so it is sent `no-store`.
 *
 * NOTE: like every state-changing route, this has no CSRF protection beyond SameSite=Lax on the
 * session cookie until SD-27 adds it (see `auth/logout`).
 */
export const POST = defineRoute({
  name: 'admin.users.create',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.USERS_CREATE },
  body: CreateUserBody,
  handler: async ({ body }) => noStoreJson(await createUser(db, body), 201),
});
