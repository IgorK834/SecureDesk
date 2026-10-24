import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type { PasswordPolicy } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';
import { ApiClient } from '../../core/http/api-client.service';
import {
  newPasswordDiffersFromCurrent,
  passwordMinimumLength,
  passwordsMatch,
  policyViolationMessages,
} from './password-form';

/** Changes a signed-in user's password, including the restricted password-expired stage. */
@Component({
  selector: 'app-change-password',
  imports: [ReactiveFormsModule],
  template: `
    <main class="password-page">
      <h1>Change password</h1>

      @if (expired()) {
        <p role="status">Your password validity period has ended. Change it before you continue.</p>
      }

      @if (policy(); as rules) {
        <section aria-labelledby="password-requirements">
          <h2 id="password-requirements">Password requirements</h2>
          <p class="hint">Use at least {{ rules.minPasswordLength }} characters.</p>
          @if (rules.rejectPersonalDataInPassword) {
            <p class="hint">Do not include your login or name.</p>
          }
        </section>
      } @else {
        <p role="status">Loading password requirements…</p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="current-password">Current password</label>
          <input
            id="current-password"
            type="password"
            formControlName="currentPassword"
            autocomplete="current-password"
            [attr.aria-invalid]="fieldError('currentPassword') ? true : null"
            [attr.aria-describedby]="
              fieldError('currentPassword') ? 'current-password-error' : null
            "
          />
          @if (fieldError('currentPassword'); as text) {
            <p id="current-password-error" class="field-error">{{ text }}</p>
          }
        </div>

        <div class="field">
          <label for="replacement-password">New password</label>
          <input
            id="replacement-password"
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="newPasswordError() || showUnchanged() ? true : null"
            [attr.aria-describedby]="
              showUnchanged()
                ? 'password-unchanged'
                : newPasswordError()
                  ? 'replacement-password-error'
                  : null
            "
          />
          @if (newPasswordError(); as text) {
            <p id="replacement-password-error" class="field-error">{{ text }}</p>
          }
        </div>

        <div class="field">
          <label for="replacement-password-confirmation">Confirm new password</label>
          <input
            id="replacement-password-confirmation"
            type="password"
            formControlName="confirmNewPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="showMismatch() || fieldError('confirmNewPassword') ? true : null"
            [attr.aria-describedby]="
              showMismatch()
                ? 'password-mismatch'
                : fieldError('confirmNewPassword')
                  ? 'replacement-password-confirmation-error'
                  : null
            "
          />
          @if (fieldError('confirmNewPassword'); as text) {
            <p id="replacement-password-confirmation-error" class="field-error">{{ text }}</p>
          }
          @if (showMismatch()) {
            <p id="password-mismatch" class="field-error">Passwords do not match.</p>
          }
        </div>

        @if (showUnchanged()) {
          <p id="password-unchanged" class="field-error">
            The new password must differ from the current password.
          </p>
        }

        <div class="error" role="alert" aria-live="polite">
          @if (errorMessage(); as text) {
            <p>{{ text }}</p>
          }
          @if (violations().length) {
            <ul>
              @for (violation of violations(); track $index) {
                <li>{{ violation }}</li>
              }
            </ul>
          }
        </div>

        @if (successMessage(); as text) {
          <p role="status">{{ text }}</p>
        }

        <div class="actions">
          <button type="submit" [disabled]="submitting() || form.invalid">
            {{ submitting() ? 'Saving…' : 'Change password' }}
          </button>
          <button type="button" [disabled]="submitting()" (click)="cancel()">Cancel</button>
        </div>
      </form>
    </main>
  `,
  styleUrl: './password-form.scss',
})
export class ChangePasswordComponent implements OnDestroy {
  private readonly api = inject(AuthApiService);
  private readonly meApi = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly policy = signal<PasswordPolicy | null>(this.auth.passwordPolicy());
  readonly form = this.fb.nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, passwordMinimumLength(() => this.minimumLength())]],
      confirmNewPassword: ['', Validators.required],
    },
    { validators: [passwordsMatch, newPasswordDiffersFromCurrent] },
  );
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly violations = signal<readonly string[]>([]);
  protected readonly successMessage = signal<string | null>(null);
  protected readonly expired = signal(this.auth.authStage() === 'PASSWORD_EXPIRED');

  constructor() {
    if (!this.policy()) this.loadPolicy();
  }

  ngOnDestroy(): void {
    this.form.reset();
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.submitting() || this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.violations.set([]);
    this.successMessage.set(null);
    this.api
      .changePassword(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.auth.setSession(response);
          this.form.reset();
          this.submitting.set(false);
          this.successMessage.set('Password changed successfully.');
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error: unknown) => this.handleFailure(error),
      });
  }

  protected cancel(): void {
    this.form.reset();
    this.submitted.set(false);
    this.errorMessage.set(null);
    this.violations.set([]);
    void this.router.navigateByUrl('/dashboard');
  }

  protected fieldError(field: 'currentPassword' | 'confirmNewPassword'): string | null {
    const control = this.form.controls[field];
    if (!control.hasError('required') || !(control.touched || this.submitted())) return null;
    return field === 'currentPassword'
      ? 'Enter your current password.'
      : 'Confirm the new password.';
  }

  protected newPasswordError(): string | null {
    const control = this.form.controls.newPassword;
    if (!(control.touched || this.submitted())) return null;
    if (control.hasError('required')) return 'Enter a new password.';
    return control.hasError('passwordMinimumLength')
      ? `Use at least ${this.minimumLength()} characters.`
      : null;
  }

  protected showMismatch(): boolean {
    const { newPassword, confirmNewPassword } = this.form.getRawValue();
    return !!newPassword && !!confirmNewPassword && this.form.hasError('passwordsMismatch');
  }

  protected showUnchanged(): boolean {
    const { currentPassword, newPassword } = this.form.getRawValue();
    return !!currentPassword && !!newPassword && this.form.hasError('passwordUnchanged');
  }

  private minimumLength(): number {
    return this.policy()?.minPasswordLength ?? 12;
  }

  private loadPolicy(): void {
    this.meApi
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.auth.setSession(response);
          this.policy.set(response.passwordPolicy);
          this.form.controls.newPassword.updateValueAndValidity();
        },
        error: (error: unknown) => {
          if (describeApiError(error).status === 401) this.goToLogin();
          else this.errorMessage.set('Could not load the password requirements. Try again later.');
        },
      });
  }

  private handleFailure(error: unknown): void {
    this.submitting.set(false);
    const { status, code } = describeApiError(error);
    if (code === 'CURRENT_PASSWORD_INCORRECT') {
      this.errorMessage.set('The current password is incorrect.');
    } else if (code === 'PASSWORD_REUSED') {
      this.errorMessage.set('Choose a password you have not used recently.');
    } else if (code === 'PASSWORD_POLICY_VIOLATION') {
      this.violations.set(policyViolationMessages(error, this.minimumLength()));
    } else if (status === 401) {
      this.goToLogin();
    } else {
      this.errorMessage.set('Could not change the password. Try again later.');
    }
  }

  private goToLogin(): void {
    this.form.reset();
    this.auth.clear();
    void this.router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
  }
}
