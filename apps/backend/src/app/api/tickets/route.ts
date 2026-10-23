import { db } from '../../../server/db/client';
import { noStoreJson } from '../../../server/http/respond';
import { defineRoute } from '../../../server/http/route-handler';
import { PERMISSIONS } from '../../../server/permissions/codes';
import { READ_TICKETS, ticketActor } from '../../../server/tickets/policy';
import { CreateTicketBody, ListTicketsQuery } from '../../../server/tickets/schemas';
import { createTicket, listTickets } from '../../../server/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The tickets the caller may read, newest first. The restriction is applied in the database query
 * (`ticketListFilter`), so a ticket outside the caller's scope is never loaded, and `total` counts
 * only what they may see. The Administrator holds no ticket permission and gets 403.
 */
export const GET = defineRoute({
  name: 'tickets.list',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: READ_TICKETS },
  query: ListTicketsQuery,
  handler: ({ session, query }) => {
    const { items, total } = listTickets(db, ticketActor(session), query);
    return noStoreJson({ items, limit: query.limit, offset: query.offset, total });
  },
});

/** Files a ticket. The creator is the caller; the status is OPEN and nobody is assigned. */
export const POST = defineRoute({
  name: 'tickets.create',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.TICKETS_CREATE },
  body: CreateTicketBody,
  handler: ({ session, body }) => noStoreJson(createTicket(db, ticketActor(session), body), 201),
});
