import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TicketsApiService } from './tickets-api.service';

function setup() {
  const http = { get: vi.fn(() => of({})), post: vi.fn(() => of({})), patch: vi.fn(() => of({})) };
  const api = Injector.create({
    providers: [
      { provide: HttpClient, useValue: http },
      { provide: TicketsApiService, useClass: TicketsApiService },
    ],
  }).get(TicketsApiService);
  return { api, http };
}

describe('TicketsApiService', () => {
  it('lists tickets with bounded paging parameters', async () => {
    const { api, http } = setup();

    await firstValueFrom(api.list({ limit: 20, offset: 40 }));

    const [url, options] = http.get.mock.calls[0] as unknown as [
      string,
      { params: { get(name: string): string | null } },
    ];
    expect(url).toBe('/api/tickets');
    expect(options.params.get('limit')).toBe('20');
    expect(options.params.get('offset')).toBe('40');
  });

  it('gets and creates tickets through relative URLs', async () => {
    const { api, http } = setup();
    const body = { title: 'Printer', description: 'It is jammed.' };

    await firstValueFrom(api.get('ticket/id'));
    await firstValueFrom(api.create(body));

    expect(http.get).toHaveBeenCalledWith('/api/tickets/ticket%2Fid');
    expect(http.post).toHaveBeenCalledWith('/api/tickets', body);
  });

  it('updates status and assignee through their typed endpoints', async () => {
    const { api, http } = setup();

    await firstValueFrom(api.updateStatus('t-1', 'RESOLVED'));
    await firstValueFrom(api.assign('t-1', 'employee-id'));

    expect(http.patch).toHaveBeenNthCalledWith(1, '/api/tickets/t-1/status', {
      status: 'RESOLVED',
    });
    expect(http.patch).toHaveBeenNthCalledWith(2, '/api/tickets/t-1/assignee', {
      assignedToUserId: 'employee-id',
    });
  });
});
