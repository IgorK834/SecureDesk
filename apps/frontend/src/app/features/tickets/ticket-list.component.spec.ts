// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { TicketListComponent } from './ticket-list.component';
import { TicketsApiService, type Ticket, type TicketPage } from './tickets-api.service';

const HOSTILE = '<img src=x onerror=alert(1)>';
const ticket: Ticket = {
  id: '00000000-0000-4000-8000-000000000001',
  title: HOSTILE,
  description: 'Plain text',
  status: 'OPEN',
  createdByUserId: 'guest-id',
  assignedToUserId: null,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
};

async function setup(
  answer = of<TicketPage>({ items: [ticket], limit: 20, offset: 0, total: 1 }),
  canCreate = true,
) {
  const api = { list: vi.fn(() => answer) };
  TestBed.configureTestingModule({
    imports: [TicketListComponent],
    providers: [
      provideRouter([]),
      { provide: TicketsApiService, useValue: api },
      { provide: AuthService, useValue: { has: () => canCreate } },
    ],
  });
  const fixture = TestBed.createComponent(TicketListComponent);
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  return { api, fixture, root: fixture.nativeElement as HTMLElement };
}

describe('TicketListComponent', () => {
  it('renders hostile ticket markup as literal text without creating an element', async () => {
    const { root } = await setup();

    expect(root.querySelector('tbody a')?.textContent).toBe(HOSTILE);
    expect(root.querySelector('img')).toBeNull();
  });

  it('asks only for its current page and links to ticket creation', async () => {
    const { api, root } = await setup();

    expect(api.list).toHaveBeenCalledWith({ limit: 20, offset: 0 });
    expect(root.querySelector('a[href="/tickets/new"]')?.textContent).toContain('Create ticket');
  });

  it('shows the shared forbidden state for a 403', async () => {
    const error = new HttpErrorResponse({ status: 403, statusText: 'Forbidden' });
    const { root } = await setup(throwError(() => error));

    expect(root.querySelector('app-forbidden')).not.toBeNull();
  });

  it('shows a neutral error for a failed request that is not forbidden', async () => {
    const error = new HttpErrorResponse({ status: 500, statusText: 'Error' });
    const { root } = await setup(throwError(() => error));

    expect(root.textContent).toContain('Could not load tickets.');
    expect(root.querySelector('app-forbidden')).toBeNull();
  });

  it('shows an empty state and hides creation without the permission', async () => {
    const { root } = await setup(of({ items: [], limit: 20, offset: 0, total: 0 }), false);

    expect(root.textContent).toContain('No tickets are available.');
    expect(root.querySelector('a[href="/tickets/new"]')).toBeNull();
  });

  it('loads the next page through bounded pagination', async () => {
    const answer = of<TicketPage>({ items: [ticket], limit: 20, offset: 0, total: 41 });
    const { api, fixture, root } = await setup(answer);
    const next = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Next',
    ) as HTMLButtonElement;

    next.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(api.list).toHaveBeenLastCalledWith({ limit: 20, offset: 20 });
    expect(root.textContent).toContain('Page 2 of 3');
  });
});
