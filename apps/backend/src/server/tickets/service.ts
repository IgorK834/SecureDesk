import { and, count, desc, eq, isNull } from 'drizzle-orm';
import type { AppDb } from '../db/connection';
import { type TicketRow, type TicketStatus, tickets, users } from '../db/schema';
import { ForbiddenError, NotFoundError, ValidationError } from '../http/errors';
import { ROLES } from '../permissions/codes';
import { type TicketDto, toTicketDto } from './mappers';
import {
  type TicketActor,
  canAssign,
  canReadTicket,
  canUpdateStatus,
  ticketListFilter,
} from './policy';

// The ticket use cases. Each one applies the object-level policy itself rather than trusting its
// caller, and throws `ApiError`s that `defineRoute` turns into responses (like password-service).
// The route wrapper has already checked that the role holds some ticket permission.

/** What the functions need from a database; a transaction handle qualifies too. */
type TicketDb = Pick<AppDb, 'select' | 'insert' | 'update'>;

/**
 * The ticket, or "not found" when it is missing OR the actor may not read it. The two cases throw
 * the same error, so a caller can never learn that a ticket they may not see exists.
 */
function readableTicket(db: TicketDb, actor: TicketActor, id: string): TicketRow {
  const ticket = db.select().from(tickets).where(eq(tickets.id, id)).get();
  if (!ticket || !canReadTicket(actor, ticket)) throw new NotFoundError();
  return ticket;
}

export function listTickets(
  db: TicketDb,
  actor: TicketActor,
  { limit, offset }: { limit: number; offset: number },
): { items: TicketDto[]; total: number } {
  const where = ticketListFilter(actor);

  // Newest first; the id breaks ties so paging never repeats or skips a row.
  const rows = db
    .select()
    .from(tickets)
    .where(where)
    .orderBy(desc(tickets.createdAt), desc(tickets.id))
    .limit(limit)
    .offset(offset)
    .all();
  // COUNT(*) always yields exactly one row.
  const { total } = db.select({ total: count() }).from(tickets).where(where).get() as {
    total: number;
  };

  return { items: rows.map(toTicketDto), total };
}

/** The creator is always the actor, the status always OPEN, and nobody is assigned yet. */
export function createTicket(
  db: TicketDb,
  actor: TicketActor,
  input: { title: string; description: string },
): TicketDto {
  const [row] = db
    .insert(tickets)
    .values({ title: input.title, description: input.description, createdByUserId: actor.id })
    .returning()
    .all();
  return toTicketDto(row as TicketRow);
}

export function getTicket(db: TicketDb, actor: TicketActor, id: string): TicketDto {
  return toTicketDto(readableTicket(db, actor, id));
}

/**
 * Not found if the actor may not read the ticket; forbidden if they may read it but not change
 * it (an employee on a ticket that is not assigned to them). Read, check and write happen in one
 * immediate transaction, so the assignee cannot change in between.
 */
export function updateTicketStatus(
  db: AppDb,
  actor: TicketActor,
  id: string,
  status: TicketStatus,
): TicketDto {
  return db.transaction(
    (tx) => {
      const ticket = readableTicket(tx, actor, id);
      if (!canUpdateStatus(actor, ticket)) throw new ForbiddenError();

      const [row] = tx.update(tickets).set({ status }).where(eq(tickets.id, id)).returning().all();
      return toTicketDto(row as TicketRow);
    },
    { behavior: 'immediate' },
  );
}

/**
 * Forbidden without `tickets:assign`, whatever the ticket (so it reveals nothing about it). The
 * assignee must be an active Employee: not blocked, not deleted, and not a Manager, Guest or
 * Administrator. Every way of failing that gives the same 400, so it does not tell a caller which
 * accounts exist or why one does not qualify.
 */
export function assignTicket(
  db: AppDb,
  actor: TicketActor,
  id: string,
  assignedToUserId: string,
): TicketDto {
  if (!canAssign(actor)) throw new ForbiddenError();

  return db.transaction(
    (tx) => {
      readableTicket(tx, actor, id);

      const assignee = tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, assignedToUserId),
            eq(users.roleId, ROLES.EMPLOYEE),
            eq(users.isBlocked, false),
            isNull(users.deletedAt),
          ),
        )
        .get();
      if (!assignee) throw new ValidationError({ assignedToUserId: 'NOT_AN_ACTIVE_EMPLOYEE' });

      const [row] = tx
        .update(tickets)
        .set({ assignedToUserId })
        .where(eq(tickets.id, id))
        .returning()
        .all();
      return toTicketDto(row as TicketRow);
    },
    { behavior: 'immediate' },
  );
}
