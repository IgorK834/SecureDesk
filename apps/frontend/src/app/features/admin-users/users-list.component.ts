import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, map, of, switchMap, tap } from 'rxjs';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type AdminUserPage, type UserStatus } from '../../core/http/admin-api.service';
import { describeApiError } from '../../core/http/api-error';
import { UserStatusBadgeComponent } from './user-status-badge.component';
import { ROLE_LABELS, STATUS_LABELS } from './user-status';

/** How long typing must pause before the list is asked for again. */
export const FILTER_DEBOUNCE_MS = 300;
export const PAGE_SIZE = 20;

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: AdminUserPage }
  /** `status` is the HTTP status of the failed call (0: no answer). */
  | { kind: 'error'; status: number };

interface Filters {
  q: string;
  role: Role | '';
  status: UserStatus | '';
}

const sameFilters = (a: Filters, b: Filters) =>
  a.q === b.q && a.role === b.role && a.status === b.status;

/**
 * The accounts table of the administrator: filterable by search text, role and status, and
 * paged. The server does the filtering and never sends a soft-deleted account, so every request
 * asks it again rather than keeping a copy; whatever it answers is all that is shown.
 */
@Component({
  selector: 'app-users-list',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, UserStatusBadgeComponent],
  template: `
    <h1>Users</h1>
    @if (auth.has('users:create')) {
      <p><a routerLink="/admin/users/new">New user</a></p>
    }

    <form [formGroup]="form" role="search" aria-label="Filter users">
      <label>
        Search
        <input
          type="search"
          formControlName="q"
          placeholder="Login or name"
          maxlength="64"
          autocomplete="off"
        />
      </label>
      <label>
        Role
        <select formControlName="role">
          <option value="">All roles</option>
          @for (role of roles; track role.code) {
            <option [value]="role.code">{{ role.label }}</option>
          }
        </select>
      </label>
      <label>
        Status
        <select formControlName="status">
          <option value="">All statuses</option>
          @for (status of statuses; track status.code) {
            <option [value]="status.code">{{ status.label }}</option>
          }
        </select>
      </label>
    </form>

    @let current = state();
    @switch (current.kind) {
      @case ('loading') {
        <p role="status">Loading users…</p>
      }
      @case ('error') {
        <div role="alert">
          @switch (current.status) {
            @case (403) {
              <p>Your account is not allowed to view users.</p>
            }
            @case (401) {
              <p>Your session has ended. <a routerLink="/login">Sign in again</a>.</p>
            }
            @default {
              <p>Could not load users.</p>
              <button type="button" (click)="reload()">Try again</button>
            }
          }
        </div>
      }
      @case ('ready') {
        @if (current.data.items.length === 0) {
          <p role="status">No users match these filters.</p>
        } @else {
          <p role="status">{{ current.data.total }} account(s)</p>
          <table>
            <caption class="visually-hidden">
              Accounts
            </caption>
            <thead>
              <tr>
                <th scope="col">Login</th>
                <th scope="col">Name</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              @for (user of current.data.items; track user.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/admin/users', user.id]">{{ user.login }}</a>
                  </td>
                  <td>{{ user.firstName }} {{ user.lastName }}</td>
                  <td>{{ roleLabels[user.role] }}</td>
                  <td><app-user-status-badge [user]="user" /></td>
                  <td>{{ user.createdAt | date: 'yyyy-MM-dd' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }

        @if (pageCount() > 1) {
          <nav aria-label="Pagination">
            <button type="button" (click)="goTo(page() - 1)" [disabled]="page() <= 1">
              Previous
            </button>
            <span>Page {{ page() }} of {{ pageCount() }}</span>
            <button type="button" (click)="goTo(page() + 1)" [disabled]="page() >= pageCount()">
              Next
            </button>
          </nav>
        }
      }
    }
  `,
  styles: `
    form {
      display: flex;
      flex-wrap: wrap;
      gap: 1em;
      margin-block: 1em;
    }
    label {
      display: flex;
      flex-direction: column;
    }
    table {
      border-collapse: collapse;
    }
    th,
    td {
      padding: 0.25em 0.75em;
      text-align: left;
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
export class UsersListComponent {
  private readonly api = inject(AdminApi);
  protected readonly auth = inject(AuthService);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roles = (Object.keys(ROLE_LABELS) as Role[]).map((code) => ({
    code,
    label: ROLE_LABELS[code],
  }));
  protected readonly statuses = (Object.keys(STATUS_LABELS) as UserStatus[]).map((code) => ({
    code,
    label: STATUS_LABELS[code],
  }));

  protected readonly form = new FormGroup({
    q: new FormControl('', { nonNullable: true }),
    role: new FormControl<Role | ''>('', { nonNullable: true }),
    status: new FormControl<UserStatus | ''>('', { nonNullable: true }),
  });

  /** The filters that were last applied, i.e. after typing paused (see `FILTER_DEBOUNCE_MS`). */
  private readonly filters = signal<Filters>(this.form.getRawValue());
  protected readonly page = signal(1);
  /** Bumped by "Try again" so the same query is asked for once more. */
  private readonly attempt = signal(0);

  protected readonly state = signal<ListState>({ kind: 'loading' });
  protected readonly pageCount = computed(() => {
    const current = this.state();
    return current.kind === 'ready' ? Math.max(1, Math.ceil(current.data.total / PAGE_SIZE)) : 1;
  });

  constructor() {
    // A change of filters waits for typing to pause, and starts again from the first page: the
    // page the user was on may not exist in the narrowed list.
    this.form.valueChanges
      .pipe(debounceTime(FILTER_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => {
        const next = this.form.getRawValue();
        if (sameFilters(next, this.filters())) return; // typed something and took it back
        this.filters.set(next);
        this.page.set(1);
      });

    // `switchMap` drops the answer of a request that a newer one has replaced, so a slow, stale
    // response can never overwrite what the user is now looking at.
    toObservable(
      computed(() => ({ ...this.filters(), page: this.page(), attempt: this.attempt() })),
    )
      .pipe(
        tap(() => this.state.set({ kind: 'loading' })),
        switchMap(({ q, role, status, page }) =>
          this.api
            .list({
              q: q || undefined,
              role: role || undefined,
              status: status || undefined,
              page,
              pageSize: PAGE_SIZE,
            })
            .pipe(
              map((data): ListState => ({ kind: 'ready', data })),
              catchError((error: unknown) =>
                of<ListState>({ kind: 'error', status: describeApiError(error).status }),
              ),
            ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  protected reload(): void {
    this.attempt.update((n) => n + 1);
  }
}
