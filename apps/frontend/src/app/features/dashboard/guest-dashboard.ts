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
    <p class="dashboard-intro">Create tickets and follow the tickets you created.</p>
    @if (summary(); as counts) {
      <dl>
        <div>
          <dt>You have created</dt>
          <dd>{{ counts.own }}</dd>
        </div>
      </dl>
    } @else {
      <p role="status">Ticket count is unavailable.</p>
    }
    <div class="dashboard-actions">
      <a class="card" routerLink="/tickets/new">
        <strong>Create ticket</strong>
        <span>Describe a new issue for the helpdesk.</span>
      </a>
      <a class="card" routerLink="/tickets">
        <strong>View your tickets</strong>
        <span>Follow the status of requests you created.</span>
      </a>
    </div>
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
