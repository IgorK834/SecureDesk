import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { TicketsApiService } from '../tickets/tickets-api.service';
import { loadTicketSummary } from './ticket-summary';

@Component({
  selector: 'app-manager-dashboard',
  imports: [RouterLink],
  template: `
    <h1>Manager dashboard</h1>
    <p class="dashboard-intro">See and assign every ticket, and update the status of any ticket.</p>
    @if (summary(); as counts) {
      <dl>
        <div>
          <dt>All tickets</dt>
          <dd>{{ counts.total }}</dd>
        </div>
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
        <strong>Open tickets and assign work</strong>
        <span>Review the queue, choose assignees and update ticket status.</span>
      </a>
    </div>
  `,
})
export class ManagerDashboard {
  private readonly auth = inject(AuthService);
  protected readonly summary = toSignal(
    loadTicketSummary(inject(TicketsApiService), this.auth.user()?.id ?? '').pipe(
      catchError(() => of(null)),
    ),
    { initialValue: null },
  );
}
