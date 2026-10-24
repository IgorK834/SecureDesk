import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap, type Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';
import { Forbidden } from '../forbidden/forbidden';
import { NotFound } from '../not-found/not-found';
import {
  TICKET_STATUSES,
  TicketsApiService,
  type Ticket,
  type TicketStatus,
} from './tickets-api.service';

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

type DetailState =
  { kind: 'loading' } | { kind: 'ready'; ticket: Ticket } | { kind: 'error'; status: number };

/** One ticket, with controls determined by permissions and the ticket's current assignee. */
@Component({
  selector: 'app-ticket-detail',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, Forbidden, NotFound],
  template: `
    @let current = state();
    @switch (current.kind) {
      @case ('loading') {
        <p role="status">Loading ticket…</p>
      }
      @case ('error') {
        @if (current.status === 404) {
          <app-not-found heading="Ticket not found" />
        } @else if (current.status === 403) {
          <app-forbidden />
        } @else {
          <p role="alert">Could not load the ticket.</p>
        }
      }
      @case ('ready') {
        @let ticket = current.ticket;
        <p><a routerLink="/tickets">All tickets</a></p>
        <h1>{{ ticket.title }}</h1>
        <dl>
          <dt>Status</dt>
          <dd>{{ statusLabels[ticket.status] }}</dd>
          <dt>Description</dt>
          <dd class="description">{{ ticket.description }}</dd>
          <dt>Created</dt>
          <dd>{{ ticket.createdAt | date: 'medium' }}</dd>
          <dt>Last changed</dt>
          <dd>{{ ticket.updatedAt | date: 'medium' }}</dd>
          <dt>Assignee</dt>
          <dd>{{ ticket.assignedToUserId || 'Unassigned' }}</dd>
        </dl>

        @if (canUpdateStatus(ticket)) {
          <div class="field">
            <label for="ticket-status">Status</label>
            <select
              id="ticket-status"
              [formControl]="statusControl"
              [disabled]="busy()"
              (change)="updateStatus(ticket)"
            >
              @for (status of statuses; track status) {
                <option [value]="status">{{ statusLabels[status] }}</option>
              }
            </select>
          </div>
        }

        @if (auth.has('tickets:assign')) {
          <div class="field">
            <label for="ticket-assignee">Assign to active Employee account ID</label>
            <input
              id="ticket-assignee"
              [formControl]="assigneeControl"
              autocomplete="off"
              placeholder="Employee UUID"
            />
            <button
              type="button"
              [disabled]="busy() || assigneeControl.invalid"
              (click)="assign(ticket)"
            >
              Assign
            </button>
          </div>
        }

        @if (notice(); as text) {
          <p role="status" aria-live="polite">{{ text }}</p>
        }
        @if (actionError(); as text) {
          <p role="alert" aria-live="assertive" class="error">{{ text }}</p>
        }
      }
    }
  `,
  styles: `
    dt {
      font-weight: bold;
    }
    dd {
      margin: 0 0 0.75rem;
    }
    .description {
      white-space: pre-wrap;
    }
    .field {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-block: 1rem;
      max-width: 42rem;
    }
    .error {
      color: #b3261e;
    }
  `,
})
export class TicketDetailComponent {
  private readonly api = inject(TicketsApiService);
  private readonly route = inject(ActivatedRoute);
  protected readonly auth = inject(AuthService);

  protected readonly statuses = TICKET_STATUSES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly statusControl = new FormControl<TicketStatus>('OPEN', { nonNullable: true });
  protected readonly assigneeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  protected readonly state = signal<DetailState>({ kind: 'loading' });
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        tap(() => {
          this.state.set({ kind: 'loading' });
          this.notice.set(null);
          this.actionError.set(null);
        }),
        switchMap((id) =>
          this.api.get(id).pipe(
            map((ticket): DetailState => ({ kind: 'ready', ticket })),
            catchError((error: unknown) =>
              of<DetailState>({ kind: 'error', status: describeApiError(error).status }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        if (state.kind === 'ready') {
          this.statusControl.setValue(state.ticket.status, { emitEvent: false });
          this.assigneeControl.setValue(state.ticket.assignedToUserId ?? '', { emitEvent: false });
        }
      });
  }

  protected canUpdateStatus(ticket: Ticket): boolean {
    return (
      this.auth.has('tickets:status:update:all') ||
      (this.auth.has('tickets:status:update:assigned') &&
        ticket.assignedToUserId === this.auth.user()?.id)
    );
  }

  protected updateStatus(ticket: Ticket): void {
    this.act(this.api.updateStatus(ticket.id, this.statusControl.value), 'Status updated.');
  }

  protected assign(ticket: Ticket): void {
    if (this.assigneeControl.invalid || this.busy()) return;
    this.act(
      this.api.assign(ticket.id, this.assigneeControl.value.trim()),
      'Ticket assigned.',
      true,
    );
  }

  private act(request: Observable<Ticket>, message: string, assigning = false): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    request.subscribe({
      next: (ticket) => {
        this.busy.set(false);
        this.state.set({ kind: 'ready', ticket });
        this.statusControl.setValue(ticket.status, { emitEvent: false });
        this.assigneeControl.setValue(ticket.assignedToUserId ?? '', { emitEvent: false });
        this.notice.set(message);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const { status } = describeApiError(error);
        if (status === 404 || status === 403) this.state.set({ kind: 'error', status });
        else
          this.actionError.set(
            assigning && status === 400
              ? 'Choose an active Employee account ID.'
              : 'Could not update the ticket. Try again.',
          );
      },
    });
  }
}
