import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TicketsApiService } from '../tickets/tickets-api.service';
import { loadTicketSummary } from './ticket-summary';

@Component({
  selector: 'app-guest-dashboard',
  imports: [RouterLink],
  template: `
    <h1>Guest dashboard</h1>
    <p>Create tickets and follow the tickets you created.</p>
    @if (summary(); as counts) {
      <p>
        You have created <strong>{{ counts.own }}</strong> ticket(s).
      </p>
    } @else {
      <p role="status">Ticket count is unavailable.</p>
    }
    <p><a routerLink="/tickets/new">Create ticket</a></p>
    <p><a routerLink="/tickets">View your tickets</a></p>
  `,
})
export class GuestDashboard {
  private readonly auth = inject(AuthService);
  protected readonly summary = toSignal(
    loadTicketSummary(inject(TicketsApiService), this.auth.user()?.id ?? '').pipe(
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
}
