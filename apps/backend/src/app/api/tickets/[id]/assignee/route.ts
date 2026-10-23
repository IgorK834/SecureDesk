import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { PERMISSIONS } from '../../../../../server/permissions/codes';
import { ticketActor } from '../../../../../server/tickets/policy';
import { AssignTicketBody, TicketParams } from '../../../../../server/tickets/schemas';
import { assignTicket } from '../../../../../server/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Assigns the ticket to an active Employee. Only a Manager holds `tickets:assign`. */
export const PATCH = defineRoute({
  name: 'tickets.assign',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: PERMISSIONS.TICKETS_ASSIGN },
  params: TicketParams,
  body: AssignTicketBody,
  handler: ({ session, params, body }) =>
    noStoreJson(assignTicket(db, ticketActor(session), params.id, body.assignedToUserId)),
});
