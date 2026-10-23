import { Component, EventEmitter, Input, Output, ViewChild, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import {
  ASSIGNABLE_ROLES,
  AdminApi,
  type AdminUser,
  type AssignableRole,
  type UpdateUserRequest,
} from '../../core/http/admin-api.service';
import { describeApiError } from '../../core/http/api-error';
import { TemporaryPasswordDialogComponent } from '../../shared/ui/temporary-password-dialog.component';
import { actionErrorMessage } from './error-messages';
import { ROLE_LABELS, isProtectedAccount } from './user-status';

// These mirror the server's schema (`server/users/schemas.ts`) so that a mistake is shown before
// the request is sent. They are a convenience only: the server validates everything again, and
// is the only judge.
const LOGIN_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const NAME_MAX_LENGTH = 64;

const login = (control: AbstractControl<string>): ValidationErrors | null => {
  const value = control.value.trim();
  if (value === '') return { required: true };
  return LOGIN_PATTERN.test(value) ? null : { loginPattern: true };
};

const name = (control: AbstractControl<string>): ValidationErrors | null => {
  const value = control.value.trim();
  if (value === '') return { required: true };
  return value.length > NAME_MAX_LENGTH ? { nameTooLong: true } : null;
};

const MESSAGES: Record<string, Record<string, string>> = {
  login: {
    required: 'Enter a login.',
    loginPattern: 'Use 3 to 32 letters, digits, dots, underscores or hyphens.',
    loginTaken: 'This login is already in use.',
  },
  firstName: { required: 'Enter a first name.', nameTooLong: 'Use at most 64 characters.' },
  lastName: { required: 'Enter a last name.', nameTooLong: 'Use at most 64 characters.' },
  role: { required: 'Choose a role.' },
};

/**
 * Creating an account (routed at `/admin/users/new`) and, with a `user`, editing one (embedded in
 * the detail page). An edit sends only the fields that changed, and never the login: the server
 * accepts nothing else. Creating shows the one-time temporary password before leaving the page.
 */
@Component({
  selector: 'app-user-form',
  imports: [ReactiveFormsModule, RouterLink, TemporaryPasswordDialogComponent],
  template: `
    <h1>{{ user ? 'Edit account' : 'New user' }}</h1>

    <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
      @if (!user) {
        <div class="field">
          <label for="user-login">Login</label>
          <input
            id="user-login"
            formControlName="login"
            autocomplete="off"
            [attr.aria-invalid]="message('login') ? true : null"
            [attr.aria-describedby]="message('login') ? 'user-login-error' : null"
          />
          @if (message('login'); as text) {
            <p id="user-login-error" class="error">{{ text }}</p>
          }
        </div>
      }

      <div class="field">
        <label for="user-first-name">First name</label>
        <input
          id="user-first-name"
          formControlName="firstName"
          autocomplete="off"
          [attr.aria-invalid]="message('firstName') ? true : null"
          [attr.aria-describedby]="message('firstName') ? 'user-first-name-error' : null"
        />
        @if (message('firstName'); as text) {
          <p id="user-first-name-error" class="error">{{ text }}</p>
        }
      </div>

      <div class="field">
        <label for="user-last-name">Last name</label>
        <input
          id="user-last-name"
          formControlName="lastName"
          autocomplete="off"
          [attr.aria-invalid]="message('lastName') ? true : null"
          [attr.aria-describedby]="message('lastName') ? 'user-last-name-error' : null"
        />
        @if (message('lastName'); as text) {
          <p id="user-last-name-error" class="error">{{ text }}</p>
        }
      </div>

      @if (roleIsFixed()) {
        <p>The role of the permanent ADMIN account cannot be changed.</p>
      } @else {
        <div class="field">
          <label for="user-role">Role</label>
          <select
            id="user-role"
            formControlName="role"
            [attr.aria-invalid]="message('role') ? true : null"
            [attr.aria-describedby]="message('role') ? 'user-role-error' : null"
          >
            <option value="">Choose a role</option>
            @for (role of roles; track role.code) {
              <option [value]="role.code">{{ role.label }}</option>
            }
          </select>
          @if (message('role'); as text) {
            <p id="user-role-error" class="error">{{ text }}</p>
          }
        </div>
      }

      @if (formError(); as text) {
        <p role="alert" class="error">{{ text }}</p>
      }

      <button type="submit" [disabled]="busy()">
        {{ user ? 'Save changes' : 'Create account' }}
      </button>
      @if (user) {
        <button type="button" (click)="cancelled.emit()">Cancel</button>
      } @else {
        <a routerLink="/admin/users">Cancel</a>
      }
    </form>

    <app-temporary-password-dialog />
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      margin-block: 0.75em;
      max-width: 24em;
    }
    .error {
      margin: 0.25em 0 0;
      color: #b3261e;
    }
  `,
})
export class UserFormComponent {
  private readonly api = inject(AdminApi);
  private readonly router = inject(Router);
  // Static: the dialog is always in the template, never inside a conditional block.
  @ViewChild(TemporaryPasswordDialogComponent, { static: true })
  private passwordDialog!: TemporaryPasswordDialogComponent;

  /** The server's answer to a successful edit. */
  @Output() readonly saved = new EventEmitter<AdminUser>();
  /** The editor was closed without sending anything. */
  @Output() readonly cancelled = new EventEmitter<void>();

  private account: AdminUser | undefined;

  /** The account being edited. Left unset, the form creates a new one. */
  @Input() set user(account: AdminUser) {
    this.account = account;
    // The role of the permanent ADMIN account is not a choice (and not an assignable one).
    this.form.reset({
      login: account.login,
      firstName: account.firstName,
      lastName: account.lastName,
      role: isProtectedAccount(account) ? 'MANAGER' : (account.role as AssignableRole),
    });
  }
  get user(): AdminUser | undefined {
    return this.account;
  }

  protected readonly roles = ASSIGNABLE_ROLES.map((code) => ({ code, label: ROLE_LABELS[code] }));
  protected readonly form = new FormGroup({
    login: new FormControl('', { nonNullable: true, validators: [login] }),
    firstName: new FormControl('', { nonNullable: true, validators: [name] }),
    lastName: new FormControl('', { nonNullable: true, validators: [name] }),
    role: new FormControl<AssignableRole | ''>('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly formError = signal<string | null>(null);

  /** The permanent ADMIN account keeps its role: the field is not offered at all. */
  protected roleIsFixed(): boolean {
    return !!this.user && isProtectedAccount(this.user);
  }

  /** The text for a field that is wrong, once the user has been to it or tried to submit. */
  protected message(field: keyof typeof MESSAGES): string | null {
    const control = this.form.get(field);
    if (!control?.errors || !(control.touched || this.submitted())) return null;
    const [code] = Object.keys(control.errors);
    return (code && MESSAGES[field]?.[code]) || null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.busy()) return;

    const user = this.user;
    if (this.form.invalid) return;
    if (user) this.save(user);
    else this.create();
  }

  private create(): void {
    const { login, firstName, lastName, role } = this.form.getRawValue();
    this.send(
      this.api.create({
        login: login.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role as AssignableRole,
      }),
      async ({ user, temporaryPassword }) => {
        // The only time the password exists: it is handed to the dialog and nowhere else.
        await this.passwordDialog.open({
          login: user.login,
          password: temporaryPassword.value,
          expiresAt: temporaryPassword.expiresAt,
        });
        await this.router.navigate(['/admin/users', user.id]);
      },
    );
  }

  private save(user: AdminUser): void {
    const value = this.form.getRawValue();
    const changes: UpdateUserRequest = {};
    if (value.firstName.trim() !== user.firstName) changes.firstName = value.firstName.trim();
    if (value.lastName.trim() !== user.lastName) changes.lastName = value.lastName.trim();
    if (!this.roleIsFixed() && value.role !== user.role)
      changes.role = value.role as AssignableRole;

    if (Object.keys(changes).length === 0) {
      this.cancelled.emit(); // nothing to send
      return;
    }
    this.send(this.api.update(user.id, changes), (updated) => this.saved.emit(updated));
  }

  /**
   * Sends the request. After a success the form stays busy: the caller is about to replace this
   * page, and a second click in between would send the request again.
   */
  private send<T>(request: Observable<T>, onSuccess: (result: T) => void | Promise<void>): void {
    this.busy.set(true);
    this.formError.set(null);
    request.subscribe({
      next: (result) => void onSuccess(result),
      error: (error: unknown) => {
        this.busy.set(false);
        if (describeApiError(error).code === 'LOGIN_ALREADY_EXISTS') {
          this.form.controls.login.setErrors({ loginTaken: true });
          this.form.controls.login.markAsTouched();
        } else {
          this.formError.set(actionErrorMessage(error));
        }
      },
    });
  }
}
