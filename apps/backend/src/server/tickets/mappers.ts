import type { TicketRow, TicketStatus } from '../db/schema';

/** The only ticket shape that leaves the server. */
export interface TicketDto {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  createdByUserId: string;
  assignedToUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Allowlist mapper, like `toSafeUser`: every field is copied by name, so a column added to
 * `tickets` later stays server-side until someone deliberately adds it here. `title` and
 * `description` are passed through untouched: they are plain text and the client must not
 * render them as HTML.
 */
export function toTicketDto(row: TicketRow): TicketDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdByUserId: row.createdByUserId,
    assignedToUserId: row.assignedToUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
