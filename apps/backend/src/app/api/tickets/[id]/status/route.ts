import { db } from '../../../../../server/db/client';
import { noStoreJson } from '../../../../../server/http/respond';
import { defineRoute } from '../../../../../server/http/route-handler';
import { UPDATE_TICKET_STATUS, ticketActor } from '../../../../../server/tickets/policy';
import { TicketParams, UpdateTicketStatusBody } from '../../../../../server/tickets/schemas';
import { updateTicketStatus } from '../../../../../server/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Changes the status. A Manager may change any ticket, an Employee only one assigned to them: 404
 * if they cannot even read it, 403 if they can read it but not change it.
 */
export const PATCH = defineRoute({
  name: 'tickets.update_status',
  auth: { stages: ['FULLY_AUTHENTICATED'], permission: UPDATE_TICKET_STATUS },
  params: TicketParams,
  body: UpdateTicketStatusBody,
  handler: ({ session, params, body }) =>
    noStoreJson(updateTicketStatus(db, ticketActor(session), params.id, body.status)),
});
