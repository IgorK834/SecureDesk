import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TicketsApiService } from '../tickets/tickets-api.service';
import { loadTicketSummary } from './ticket-summary';

@Component({
  selector: 'app-employee-dashboard',
  imports: [RouterLink],
  template: `
    <h1>Employee dashboard</h1>
    <p class="dashboard-intro">
      Work on the tickets assigned to you and follow the tickets you created.
    </p>
    @if (summary(); as counts) {
      <dl>
        <div>
          <dt>Assigned to you</dt>
          <dd>{{ counts.assigned }}</dd>
        </div>
        <div>
          <dt>Created by you</dt>
          <dd>{{ counts.own }}</dd>
        </div>
      </dl>
    } @else {
      <p role="status">Ticket counts are unavailable.</p>
    }
    <div class="dashboard-actions">
      <a class="card" routerLink="/tickets">
        <strong>Open your tickets</strong>
        <span>Review assigned work and tickets you created.</span>
      </a>
    </div>
  `,
})
export class EmployeeDashboard {
  private readonly auth = inject(AuthService);
  protected readonly summary = toSignal(
    loadTicketSummary(inject(TicketsApiService), this.auth.user()?.id ?? '').pipe(
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
}
