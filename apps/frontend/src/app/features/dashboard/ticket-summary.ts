import { map, type Observable } from 'rxjs';
import { TicketsApiService } from '../tickets/tickets-api.service';

export interface TicketSummary {
  total: number;
  assigned: number;
  own: number;
}

/** One bounded read is enough for the deliberately small demonstration dataset. */
export function loadTicketSummary(
  api: TicketsApiService,
  userId: string,
): Observable<TicketSummary> {
  return api.list({ limit: 100, offset: 0 }).pipe(
    map((page) => ({
      total: page.total,
      assigned: page.items.filter((ticket) => ticket.assignedToUserId === userId).length,
      own: page.items.filter((ticket) => ticket.createdByUserId === userId).length,
    })),
  );
}
