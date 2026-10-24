// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { TicketDetailComponent } from './ticket-detail.component';
import { TicketsApiService, type Ticket } from './tickets-api.service';

const HOSTILE = '<img src=x onerror=alert(1)>';
const baseTicket: Ticket = {
  id: '00000000-0000-4000-8000-000000000001',
  title: HOSTILE,
  description: `${HOSTILE}\nThe printer is jammed.`,
  status: 'OPEN',
  createdByUserId: 'creator-id',
  assignedToUserId: null,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
};

function setup(role: Role, ticket: Ticket = baseTicket, answer: Observable<Ticket> = of(ticket)) {
  const me = meResponse(role);
  const api = {
    get: vi.fn(() => answer),
    updateStatus: vi.fn((_id: string, status: Ticket['status']) => of({ ...ticket, status })),
    assign: vi.fn((_id: string, assignedToUserId: string) => of({ ...ticket, assignedToUserId })),
  };
  const auth = {
    user: signal(me.user),
    has: (permission: string) => me.permissions.includes(permission),
  };
  TestBed.configureTestingModule({
    imports: [TicketDetailComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id: ticket.id })) },
      },
      { provide: TicketsApiService, useValue: api },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(TicketDetailComponent);
  fixture.detectChanges();
  return { api, auth, fixture, root: fixture.nativeElement as HTMLElement };
}

describe('TicketDetailComponent', () => {
  it('renders title and description as literal text and never executes markup', () => {
    const { root } = setup('MANAGER');

    expect(root.querySelector('h1')?.textContent).toBe(HOSTILE);
    expect(root.querySelector('.description')?.textContent).toContain(HOSTILE);
    expect(root.querySelector('img')).toBeNull();
  });

  it('shows assignment and status controls only to a Manager', () => {
    const { root } = setup('MANAGER');

    expect(root.querySelector('#ticket-assignee')).not.toBeNull();
    expect(root.querySelector('#ticket-status')).not.toBeNull();
  });

  it('shows status, but not assignment, to the Employee assigned to the ticket', () => {
    const me = meResponse('EMPLOYEE');
    const { root } = setup('EMPLOYEE', { ...baseTicket, assignedToUserId: me.user.id });

    expect(root.querySelector('#ticket-status')).not.toBeNull();
    expect(root.querySelector('#ticket-assignee')).toBeNull();
  });

  it('shows neither control to an Employee who is not assigned or to a Guest', () => {
    for (const role of ['EMPLOYEE', 'GUEST'] as const) {
      TestBed.resetTestingModule();
      const { root } = setup(role);
      expect(root.querySelector('#ticket-status')).toBeNull();
      expect(root.querySelector('#ticket-assignee')).toBeNull();
    }
  });

  it('shows the indistinguishable ticket-not-found state for 404', () => {
    const error = new HttpErrorResponse({ status: 404, statusText: 'Not Found' });
    const { root } = setup(
      'GUEST',
      baseTicket,
      throwError(() => error),
    );

    expect(root.querySelector('app-not-found h1')?.textContent).toBe('Ticket not found');
    expect(root.textContent).toContain('does not exist, or you are not allowed to see it');
  });

  it.each([
    [403, 'app-forbidden'],
    [500, '[role="alert"]'],
  ] as const)('shows the shared/neutral state for an initial %i', (status, selector) => {
    const error = new HttpErrorResponse({ status, statusText: 'Error' });
    const { root } = setup(
      'GUEST',
      baseTicket,
      throwError(() => error),
    );

    expect(root.querySelector(selector)).not.toBeNull();
  });

  it('updates status through the API', () => {
    const { api, fixture, root } = setup('MANAGER');
    const select = root.querySelector('#ticket-status') as HTMLSelectElement;
    select.value = 'RESOLVED';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(api.updateStatus).toHaveBeenCalledWith(baseTicket.id, 'RESOLVED');
    expect(root.textContent).toContain('Status updated.');
  });

  it('assigns an active Employee account ID through the API', () => {
    const { api, fixture, root } = setup('MANAGER');
    const input = root.querySelector('#ticket-assignee') as HTMLInputElement;
    input.value = '00000000-0000-4000-8000-000000000099';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Assign')
      ?.click();

    expect(api.assign).toHaveBeenCalledWith(baseTicket.id, '00000000-0000-4000-8000-000000000099');
  });

  it('maps an invalid assignee to readable guidance', () => {
    const { api, fixture, root } = setup('MANAGER');
    api.assign.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 400, statusText: 'Bad Request' })),
    );
    const input = root.querySelector('#ticket-assignee') as HTMLInputElement;
    input.value = 'not-an-active-employee';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    [...root.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Assign')
      ?.click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Choose an active Employee account ID.');
  });

  it('shows a neutral update error and replaces a refused ticket with the shared state', () => {
    const first = setup('MANAGER');
    first.api.updateStatus.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500, statusText: 'Error' })),
    );
    (first.root.querySelector('#ticket-status') as HTMLSelectElement).dispatchEvent(
      new Event('change'),
    );
    first.fixture.detectChanges();
    expect(first.root.textContent).toContain('Could not update the ticket. Try again.');

    TestBed.resetTestingModule();
    const second = setup('MANAGER');
    second.api.updateStatus.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 403, statusText: 'Forbidden' })),
    );
    (second.root.querySelector('#ticket-status') as HTMLSelectElement).dispatchEvent(
      new Event('change'),
    );
    second.fixture.detectChanges();
    expect(second.root.querySelector('app-forbidden')).not.toBeNull();
  });
});
