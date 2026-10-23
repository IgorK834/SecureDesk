import { db } from '../../../../server/db/client';
import { noStoreJson } from '../../../../server/http/respond';
import { defineRoute } from '../../../../server/http/route-handler';
import { READ_TICKETS, ticketActor } from '../../../../server/tickets/policy';
import { TicketParams } from '../../../../server/tickets/schemas';
import { getTicket } from '../../../../server/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One ticket. A ticket the caller may not read answers exactly like one that does not exist. */
export const GET = defineRoute({
  name: 'tickets.get',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: READ_TICKETS },
  params: TicketParams,
  handler: ({ session, params }) => noStoreJson(getTicket(db, ticketActor(session), params.id)),
});
