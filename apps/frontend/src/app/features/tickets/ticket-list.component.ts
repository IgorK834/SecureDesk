import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';
import { Forbidden } from '../forbidden/forbidden';
import { TicketsApiService, type TicketPage, type TicketStatus } from './tickets-api.service';

const PAGE_SIZE = 20;
const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

type ListState =
  { kind: 'loading' } | { kind: 'ready'; page: TicketPage } | { kind: 'error'; status: number };

/** Tickets already filtered to the caller's object-level scope by the backend. */
@Component({
  selector: 'app-ticket-list',
  imports: [DatePipe, RouterLink, Forbidden],
  template: `
    <h1>Tickets</h1>
    @if (auth.has('tickets:create')) {
      <p><a routerLink="/tickets/new">Create ticket</a></p>
    }

    @let current = state();
    @switch (current.kind) {
      @case ('loading') {
        <p role="status">Loading tickets…</p>
      }
      @case ('error') {
        @if (current.status === 403) {
          <app-forbidden />
        } @else {
          <p role="alert">Could not load tickets.</p>
        }
      }
      @case ('ready') {
        @let result = readyPage();
        @if (result && result.items.length) {
          <table>
            <caption class="visually-hidden">
              Tickets available to your account
            </caption>
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (ticket of result.items; track ticket.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/tickets', ticket.id]">{{ ticket.title }}</a>
                  </td>
                  <td>{{ statusLabels[ticket.status] }}</td>
                  <td>{{ ticket.createdAt | date: 'medium' }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (pageCount() > 1) {
            <nav aria-label="Ticket pages">
              <button type="button" [disabled]="page() === 1" (click)="page.set(page() - 1)">
                Previous
              </button>
              <span>Page {{ page() }} of {{ pageCount() }}</span>
              <button
                type="button"
                [disabled]="page() === pageCount()"
                (click)="page.set(page() + 1)"
              >
                Next
              </button>
            </nav>
          }
        } @else {
          <p role="status">No tickets are available.</p>
        }
      }
    }
  `,
  styles: `
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th,
    td {
      padding: 0.5rem;
      text-align: left;
      border-bottom: 1px solid #ccc;
    }
    nav {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-block: 1rem;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `,
})
export class TicketListComponent {
  private readonly api = inject(TicketsApiService);
  protected readonly auth = inject(AuthService);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly page = signal(1);
  protected readonly state = signal<ListState>({ kind: 'loading' });
  protected readonly readyPage = computed(() => {
    const current = this.state();
    return current.kind === 'ready' ? current.page : null;
  });
  protected readonly pageCount = computed(() => {
    const result = this.readyPage();
    return result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  });

  constructor() {
    toObservable(this.page)
      .pipe(
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap((page) =>
          this.api.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }).pipe(
            map((result): ListState => ({ kind: 'ready', page: result })),
            catchError((error: unknown) =>
              of<ListState>({ kind: 'error', status: describeApiError(error).status }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }
}
