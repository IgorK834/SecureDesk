import { DatePipe } from '@angular/common';
import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, map, of, switchMap, tap, type Observable } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type AdminUser } from '../../core/http/admin-api.service';
import { describeApiError } from '../../core/http/api-error';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { TemporaryPasswordDialogComponent } from '../../shared/ui/temporary-password-dialog.component';
import { Forbidden } from '../forbidden/forbidden';
import { NotFound } from '../not-found/not-found';
import { actionErrorMessage } from './error-messages';
import { UserFormComponent } from './user-form.component';
import { UserStatusBadgeComponent } from './user-status-badge.component';
import { ROLE_LABELS, isProtectedAccount } from './user-status';

type DetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; user: AdminUser }
  /** `status` is the HTTP status of the failed call (0: no answer). */
  | { kind: 'error'; status: number };

const PROTECTED_NOTE = 'The permanent ADMIN account is protected: it cannot be blocked or deleted.';

/**
 * One account: its details, an edit form, and the block, unblock, reset-password and delete
 * actions. Whether a button is shown follows the permissions the session reports, which is a
 * convenience: the server decides every call, and a refusal (403, 404, 409) is shown as the
 * message it is. Each action asks for confirmation and says what will happen. A reset then shows
 * the new temporary password once, in a dialog, and keeps it nowhere else.
 */
@Component({
  selector: 'app-user-detail',
  imports: [
    DatePipe,
    RouterLink,
    UserStatusBadgeComponent,
    UserFormComponent,
    ConfirmDialogComponent,
    TemporaryPasswordDialogComponent,
    Forbidden,
    NotFound,
  ],
  template: `
    @let current = state();
    @switch (current.kind) {
      @case ('loading') {
        <p role="status">Loading the account…</p>
      }
      @case ('error') {
        @switch (current.status) {
          @case (404) {
            <app-not-found />
          }
          @case (403) {
            <app-forbidden />
          }
          @case (401) {
            <p role="alert">Your session has ended. <a routerLink="/login">Sign in again</a>.</p>
          }
          @default {
            <div role="alert">
              <p>Could not load the account.</p>
              <a routerLink="/admin/users">Back to the users</a>
            </div>
          }
        }
      }
      @case ('ready') {
        @let user = current.user;
        <p><a routerLink="/admin/users">All users</a></p>

        @if (editing()) {
          <app-user-form [user]="user" (saved)="onSaved($event)" (cancelled)="editing.set(false)" />
        } @else {
          <h1>{{ user.firstName }} {{ user.lastName }}</h1>
          <dl>
            <dt>Login</dt>
            <dd>{{ user.login }}</dd>
            <dt>Role</dt>
            <dd>{{ roleLabels[user.role] }}</dd>
            <dt>Status</dt>
            <dd><app-user-status-badge [user]="user" /></dd>
            @if (user.temporaryPasswordExpiresAt) {
              <dt>Temporary password valid until</dt>
              <dd>{{ user.temporaryPasswordExpiresAt | date: 'medium' }}</dd>
            }
            @if (user.passwordChangedAt) {
              <dt>Password changed</dt>
              <dd>{{ user.passwordChangedAt | date: 'medium' }}</dd>
            }
            <dt>Created</dt>
            <dd>{{ user.createdAt | date: 'medium' }}</dd>
            <dt>Last changed</dt>
            <dd>{{ user.updatedAt | date: 'medium' }}</dd>
          </dl>

          @if (notice(); as text) {
            <p role="status">{{ text }}</p>
          }
          @if (actionError(); as text) {
            <p role="alert" class="error">{{ text }}</p>
          }

          <div class="actions">
            @if (auth.has('users:update')) {
              <button type="button" [disabled]="busy()" (click)="startEditing()">Edit</button>
            }
            @if (auth.has('users:reset-password')) {
              <button type="button" [disabled]="busy()" (click)="resetPassword(user)">
                Reset password
              </button>
            }
            @if (auth.has('users:block')) {
              @if (user.isBlocked) {
                <button type="button" [disabled]="busy()" (click)="toggleBlock(user)">
                  Unblock
                </button>
              } @else {
                <button
                  type="button"
                  [disabled]="busy() || isProtected()"
                  [attr.title]="isProtected() ? protectedNote : null"
                  (click)="toggleBlock(user)"
                >
                  Block
                </button>
              }
            }
            @if (auth.has('users:delete')) {
              <button
                type="button"
                class="danger"
                [disabled]="busy() || isProtected()"
                [attr.title]="isProtected() ? protectedNote : null"
                (click)="remove(user)"
              >
                Delete
              </button>
            }
          </div>
          @if (isProtected()) {
            <p>{{ protectedNote }}</p>
          }
        }
      }
    }

    <app-confirm-dialog />
    <app-temporary-password-dialog />
  `,
  styles: `
    dt {
      font-weight: bold;
    }
    dd {
      margin: 0 0 0.75em;
    }
    .actions {
      display: flex;
      gap: 0.5em;
    }
    .error {
      color: #b3261e;
    }
  `,
})
export class UserDetailComponent {
  private readonly api = inject(AdminApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  // Static: the dialog is always in the template, never inside a conditional block.
  @ViewChild(ConfirmDialogComponent, { static: true }) private confirm!: ConfirmDialogComponent;
  @ViewChild(TemporaryPasswordDialogComponent, { static: true })
  private passwordDialog!: TemporaryPasswordDialogComponent;
  protected readonly auth = inject(AuthService);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly protectedNote = PROTECTED_NOTE;

  protected readonly state = signal<DetailState>({ kind: 'loading' });
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly isProtected = computed(() => {
    const current = this.state();
    return current.kind === 'ready' && isProtectedAccount(current.user);
  });

  constructor() {
    // `paramMap` (not the snapshot): the same instance is reused when the id in the URL changes.
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        tap(() => {
          this.state.set({ kind: 'loading' });
          this.editing.set(false);
          this.notice.set(null);
          this.actionError.set(null);
        }),
        switchMap((id) =>
          this.api.get(id).pipe(
            map((user): DetailState => ({ kind: 'ready', user })),
            catchError((error: unknown) =>
              of<DetailState>({ kind: 'error', status: describeApiError(error).status }),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  protected startEditing(): void {
    this.notice.set(null);
    this.actionError.set(null);
    this.editing.set(true);
  }

  protected onSaved(user: AdminUser): void {
    this.state.set({ kind: 'ready', user });
    this.editing.set(false);
    this.notice.set('Changes saved.');
  }

  protected async toggleBlock(user: AdminUser): Promise<void> {
    if (user.isBlocked) {
      const confirmed = await this.confirm.open({
        title: 'Unblock this account?',
        message: `${user.login} will be able to sign in again with their current password. Sessions that were ended when the account was blocked stay ended.`,
        confirmLabel: 'Unblock account',
      });
      if (confirmed) {
        this.act(this.api.unblock(user.id), (updated) => {
          this.state.set({ kind: 'ready', user: updated });
          this.notice.set('Account unblocked.');
        });
      }
      return;
    }

    const confirmed = await this.confirm.open({
      title: 'Block this account?',
      message: `${user.login} will be signed out of every session at once and cannot sign in until you unblock the account.`,
      confirmLabel: 'Block account',
    });
    if (confirmed) {
      this.act(this.api.block(user.id), (updated) => {
        this.state.set({ kind: 'ready', user: updated });
        this.notice.set('Account blocked. Its sessions were ended.');
      });
    }
  }

  protected async resetPassword(user: AdminUser): Promise<void> {
    const message = [
      `${user.login} will be signed out of every session at once and their current password will stop working. They get a temporary password, valid for 12 hours, that they must replace at their next sign-in.`,
      user.isBlocked && 'The account stays blocked until you unblock it.',
      isProtectedAccount(user) &&
        'This is the permanent ADMIN account: no other account can reset it, so keep the new password safe.',
    ]
      .filter(Boolean)
      .join(' ');
    const confirmed = await this.confirm.open({
      title: 'Reset this password?',
      message,
      confirmLabel: 'Reset password',
    });
    if (!confirmed) return;

    this.act(this.api.resetPassword(user.id), ({ temporaryPassword }) => {
      this.state.set({
        kind: 'ready',
        user: {
          ...user,
          mustChangePassword: true,
          temporaryPasswordExpiresAt: temporaryPassword.expiresAt,
        },
      });
      this.notice.set('Password reset. Its sessions were ended.');
      // The only time the password exists: it goes to the dialog and nowhere else.
      void this.passwordDialog.open({
        login: user.login,
        password: temporaryPassword.value,
        expiresAt: temporaryPassword.expiresAt,
        reason: 'reset',
      });
    });
  }

  protected async remove(user: AdminUser): Promise<void> {
    const confirmed = await this.confirm.open({
      title: 'Delete this account?',
      message: `${user.login} will be signed out at once, disappear from the lists and never be able to sign in again. The login stays reserved and their tickets are kept. The application cannot undo this.`,
      confirmLabel: 'Delete account',
    });
    if (confirmed) {
      this.act(this.api.delete(user.id), () => void this.router.navigate(['/admin/users']));
    }
  }

  /** Runs one action; it is one request at a time, and a refusal is shown, not hidden. */
  private act<T>(request: Observable<T>, onSuccess: (result: T) => void): void {
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    request.subscribe({
      next: (result) => {
        this.busy.set(false);
        onSuccess(result);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.actionError.set(actionErrorMessage(error));
      },
    });
  }
}
