import { z } from 'zod';
import { TICKET_STATUSES } from '../db/schema';

// Input schemas of the ticket endpoints. All of them are strict: a field that is not listed (a
// client trying to set `createdByUserId`, `status` on creation, ...) is refused, not ignored.

export const TICKET_TITLE_MAX_LENGTH = 120;
export const TICKET_DESCRIPTION_MAX_LENGTH = 5000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** `/api/tickets/[id]`: a malformed id is refused before the database is asked about it. */
export const TicketParams = z.object({ id: z.uuid() }).strict();

export const ListTicketsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/**
 * Plain text. Surrounding whitespace is removed so a blank ticket cannot be filed; the rest is
 * stored exactly as sent (markup is not stripped or escaped: it is never rendered as HTML).
 */
export const CreateTicketBody = z
  .object({
    title: z.string().trim().min(1).max(TICKET_TITLE_MAX_LENGTH),
    description: z.string().trim().min(1).max(TICKET_DESCRIPTION_MAX_LENGTH),
  })
  .strict();

export const UpdateTicketStatusBody = z.object({ status: z.enum(TICKET_STATUSES) }).strict();

export const AssignTicketBody = z.object({ assignedToUserId: z.uuid() }).strict();
