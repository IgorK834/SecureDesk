import { type SQL, eq, or, sql } from 'drizzle-orm';
import type { ResolvedSession } from '../auth/session-service';
import { type TicketRow, tickets } from '../db/schema';
import { hasPermission } from '../permissions/authorize';
import { PERMISSIONS, type PermissionCode } from '../permissions/codes';

// Object-level access to tickets: which ticket *rows* an actor may see or change. The route
// wrapper has already checked that the role holds some ticket permission at all (`READ_TICKETS`,
// `UPDATE_TICKET_STATUS` below); this module narrows that to the rows the permission covers.
// Everything is driven by the permission codes of the role, not by the role's name, so the matrix
// in `permissions/matrix.ts` stays the single place that says who may do what. The result is
// documented in docs/permissions.md.

/** Who is acting: the signed-in user and the permissions their role was granted. */
export interface TicketActor {
  id: string;
  permissions: readonly string[];
}

export function ticketActor({ user, permissions }: ResolvedSession): TicketActor {
  return { id: user.id, permissions };
}

type TicketOwnership = Pick<TicketRow, 'createdByUserId' | 'assignedToUserId'>;

/** A route that reads tickets is open to a role holding at least one of these. */
export const READ_TICKETS: readonly PermissionCode[] = [
  PERMISSIONS.TICKETS_READ_ALL,
  PERMISSIONS.TICKETS_READ_ASSIGNED,
  PERMISSIONS.TICKETS_READ_OWN,
];

/** A route that changes a ticket's status is open to a role holding at least one of these. */
export const UPDATE_TICKET_STATUS: readonly PermissionCode[] = [
  PERMISSIONS.TICKETS_STATUS_UPDATE_ALL,
  PERMISSIONS.TICKETS_STATUS_UPDATE_ASSIGNED,
];

const NOTHING = sql`0 = 1`;

/**
 * The WHERE condition that limits a ticket query to the rows the actor may read, so a list is
 * filtered by the database and out-of-scope rows are never loaded. `undefined` means "no
 * restriction" and is returned only for `tickets:read:all`. An actor with no read permission gets a
 * condition that matches nothing: the policy fails closed, it never defaults to everything.
 */
export function ticketListFilter(actor: TicketActor): SQL | undefined {
  if (hasPermission(actor, PERMISSIONS.TICKETS_READ_ALL)) return undefined;

  return (
    or(
      hasPermission(actor, PERMISSIONS.TICKETS_READ_ASSIGNED)
        ? eq(tickets.assignedToUserId, actor.id)
        : undefined,
      hasPermission(actor, PERMISSIONS.TICKETS_READ_OWN)
        ? eq(tickets.createdByUserId, actor.id)
        : undefined,
    ) ?? NOTHING
  );
}

/** The same rule as `ticketListFilter`, for one ticket already loaded. The two must agree. */
export function canReadTicket(actor: TicketActor, ticket: TicketOwnership): boolean {
  return (
    hasPermission(actor, PERMISSIONS.TICKETS_READ_ALL) ||
    (hasPermission(actor, PERMISSIONS.TICKETS_READ_ASSIGNED) &&
      ticket.assignedToUserId === actor.id) ||
    (hasPermission(actor, PERMISSIONS.TICKETS_READ_OWN) && ticket.createdByUserId === actor.id)
  );
}

/**
 * Whether the actor may change the status: any ticket with `tickets:status:update:all`, or only
 * the one assigned to them with `tickets:status:update:assigned`. Reading is checked separately,
 * first, so a ticket the actor may not see is "not found" rather than "forbidden".
 */
export function canUpdateStatus(actor: TicketActor, ticket: TicketOwnership): boolean {
  return (
    hasPermission(actor, PERMISSIONS.TICKETS_STATUS_UPDATE_ALL) ||
    (hasPermission(actor, PERMISSIONS.TICKETS_STATUS_UPDATE_ASSIGNED) &&
      ticket.assignedToUserId === actor.id)
  );
}

/** Whether the actor may assign tickets at all (not tied to one ticket). */
export function canAssign(actor: TicketActor): boolean {
  return hasPermission(actor, PERMISSIONS.TICKETS_ASSIGN);
}
