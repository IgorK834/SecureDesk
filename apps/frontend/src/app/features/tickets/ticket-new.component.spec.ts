// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { TicketNewComponent } from './ticket-new.component';
import { TicketsApiService, type Ticket } from './tickets-api.service';

const created: Ticket = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Printer',
  description: 'Jammed',
  status: 'OPEN',
  createdByUserId: 'guest-id',
  assignedToUserId: null,
  createdAt: '2030-01-01T10:00:00.000Z',
  updatedAt: '2030-01-01T10:00:00.000Z',
};

function setup(answer: Observable<Ticket> = of(created)) {
  const api = { create: vi.fn(() => answer) };
  TestBed.configureTestingModule({
    imports: [TicketNewComponent],
    providers: [provideRouter([]), { provide: TicketsApiService, useValue: api }],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(TicketNewComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const type = (id: string, value: string) => {
    const input = root.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  return { api, fixture, navigate, root, type };
}

describe('TicketNewComponent', () => {
  it('validates required fields without sending a request', () => {
    const { api, fixture, root } = setup();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.create).not.toHaveBeenCalled();
    expect(root.textContent).toContain('Enter a title.');
    expect(root.textContent).toContain('Enter a description.');
  });

  it('sends trimmed plain text and opens the created ticket', () => {
    const { api, navigate, root, type } = setup();
    type('ticket-title', ' Printer ');
    type('ticket-description', ' Jammed ');

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(api.create).toHaveBeenCalledWith({ title: 'Printer', description: 'Jammed' });
    expect(navigate).toHaveBeenCalledWith(['/tickets', created.id]);
  });

  it('prevents a duplicate request while creation is pending', () => {
    const pending = new Subject<Ticket>();
    const { api, fixture, root, type } = setup(pending);
    type('ticket-title', 'Printer');
    type('ticket-description', 'Jammed');
    const form = root.querySelector('form') as HTMLFormElement;

    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    form.dispatchEvent(new Event('submit'));

    expect(api.create).toHaveBeenCalledOnce();
    expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    [400, 'Check the title and description.'],
    [500, 'Could not create the ticket. Try again.'],
  ] as const)('maps a %i response to a neutral error', (status, message) => {
    const error = new HttpErrorResponse({ status, statusText: 'Error' });
    const { fixture, root, type } = setup(throwError(() => error));
    type('ticket-title', 'Printer');
    type('ticket-description', 'Jammed');

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(message);
  });

  it('shows field-specific maximum-length messages', () => {
    const { fixture, root, type } = setup();
    type('ticket-title', 'x'.repeat(121));
    type('ticket-description', 'x'.repeat(5001));

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Use at most 120 characters.');
    expect(root.textContent).toContain('Use at most 5000 characters.');
  });
});
