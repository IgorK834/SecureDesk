import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TicketsApiService, type Ticket } from '../tickets/tickets-api.service';
import { loadTicketSummary } from './ticket-summary';

const ticket = (createdByUserId: string, assignedToUserId: string | null): Ticket => ({
  id: `${createdByUserId}-${assignedToUserId ?? 'none'}`,
  title: 'Ticket',
  description: 'Description',
  status: 'OPEN',
  createdByUserId,
  assignedToUserId,
  createdAt: '2030-01-01T00:00:00.000Z',
  updatedAt: '2030-01-01T00:00:00.000Z',
});

describe('loadTicketSummary', () => {
  it('counts total, assigned and own tickets from one bounded request', async () => {
    const list = vi.fn(() =>
      of({
        items: [ticket('me', null), ticket('other', 'me'), ticket('other', null)],
        limit: 100,
        offset: 0,
        total: 7,
      }),
    );

    const api = { list } as unknown as TicketsApiService;
    await expect(firstValueFrom(loadTicketSummary(api, 'me'))).resolves.toStrictEqual({
      total: 7,
      assigned: 1,
      own: 1,
    });
    expect(list).toHaveBeenCalledWith({ limit: 100, offset: 0 });
  });
});
