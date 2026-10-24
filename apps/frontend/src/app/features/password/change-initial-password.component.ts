import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type { PasswordPolicy } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';
import { ApiClient } from '../../core/http/api-client.service';
import { passwordsMatch, policyViolationMessages } from './password-form';

/** Replaces an administrator-issued temporary password before any product page can be used. */
@Component({
  selector: 'app-change-initial-password',
  imports: [ReactiveFormsModule],
  template: `
    <main class="password-page">
      <h1>Set your password</h1>
      <p>Your temporary password must be replaced before you can continue.</p>

      @if (policy(); as rules) {
        <section aria-labelledby="initial-password-requirements">
          <h2 id="initial-password-requirements">Password requirements</h2>
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
          <label for="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            formControlName="newPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="fieldError('newPassword') ? true : null"
            [attr.aria-describedby]="fieldError('newPassword') ? 'new-password-error' : null"
          />
          @if (fieldError('newPassword'); as text) {
            <p id="new-password-error" class="field-error">{{ text }}</p>
          }
        </div>

        <div class="field">
          <label for="confirm-new-password">Confirm new password</label>
          <input
            id="confirm-new-password"
            type="password"
            formControlName="confirmNewPassword"
            autocomplete="new-password"
            [attr.aria-invalid]="showMismatch() || fieldError('confirmNewPassword') ? true : null"
            [attr.aria-describedby]="
              showMismatch()
                ? 'initial-password-mismatch'
                : fieldError('confirmNewPassword')
                  ? 'confirm-new-password-error'
                  : null
            "
          />
          @if (fieldError('confirmNewPassword'); as text) {
            <p id="confirm-new-password-error" class="field-error">{{ text }}</p>
          }
          @if (showMismatch()) {
            <p id="initial-password-mismatch" class="field-error">Passwords do not match.</p>
          }
        </div>

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

        <button type="submit" [disabled]="submitting() || form.invalid">
          {{ submitting() ? 'Saving…' : 'Set password' }}
        </button>
      </form>
    </main>
  `,
  styleUrl: './password-form.scss',
})
export class ChangeInitialPasswordComponent implements OnDestroy {
  private readonly api = inject(AuthApiService);
  private readonly meApi = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group(
    {
      newPassword: ['', Validators.required],
      confirmNewPassword: ['', Validators.required],
    },
    { validators: passwordsMatch },
  );
  protected readonly policy = signal<PasswordPolicy | null>(this.auth.passwordPolicy());
  protected readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly violations = signal<readonly string[]>([]);

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
    this.api
      .changeInitialPassword(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.auth.setSession(response);
          this.form.reset();
          this.submitting.set(false);
          void this.router.navigateByUrl('/dashboard');
        },
        error: (error: unknown) => this.handleFailure(error),
      });
  }

  protected fieldError(field: 'newPassword' | 'confirmNewPassword'): string | null {
    const control = this.form.controls[field];
    return control.hasError('required') && (control.touched || this.submitted())
      ? field === 'newPassword'
        ? 'Enter a new password.'
        : 'Confirm the new password.'
      : null;
  }

  protected showMismatch(): boolean {
    const { newPassword, confirmNewPassword } = this.form.getRawValue();
    return !!newPassword && !!confirmNewPassword && this.form.hasError('passwordsMismatch');
  }

  private loadPolicy(): void {
    this.meApi
      .me()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.auth.setSession(response);
          this.policy.set(response.passwordPolicy);
        },
        error: (error: unknown) => {
          if (describeApiError(error).status === 401) this.goToLogin('session-expired');
          else this.errorMessage.set('Could not load the password requirements. Try again later.');
        },
      });
  }

  private handleFailure(error: unknown): void {
    this.submitting.set(false);
    const { status, code } = describeApiError(error);
    if (code === 'PASSWORD_POLICY_VIOLATION') {
      this.violations.set(policyViolationMessages(error, this.policy()?.minPasswordLength ?? 12));
    } else if (code === 'PASSWORD_REUSED') {
      this.errorMessage.set('Choose a password you have not used recently.');
    } else if (code === 'AUTH_TEMPORARY_PASSWORD_EXPIRED') {
      this.goToLogin('temporary-password-expired');
    } else if (status === 401) {
      this.goToLogin('session-expired');
    } else if (status === 409 && code === 'PASSWORD_CHANGE_ALREADY_COMPLETED') {
      this.form.reset();
      void this.auth.load().then(() => this.router.navigateByUrl('/dashboard'));
    } else {
      this.errorMessage.set('Could not change the password. Try again later.');
    }
  }

  private goToLogin(reason: string): void {
    this.form.reset();
    this.auth.clear();
    void this.router.navigate(['/login'], { queryParams: { reason } });
  }
}
