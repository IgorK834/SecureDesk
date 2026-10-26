import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';

@Component({
  selector: 'app-totp-challenge',
  imports: [ReactiveFormsModule],
  template: `
    <main class="totp-page">
      <h1>Two-factor authentication</h1>
      <p>Enter the current six-digit code from your authenticator app.</p>

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <label for="totp-code">Authentication code</label>
        <input
          id="totp-code"
          formControlName="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          [attr.aria-invalid]="errorMessage() ? true : null"
          aria-describedby="totp-challenge-error"
        />
        <div id="totp-challenge-error" role="alert" aria-live="polite">
          @if (errorMessage(); as error) {
            <p class="error">{{ error }}</p>
          }
        </div>
        <button type="submit" [disabled]="submitting() || form.invalid">
          {{ submitting() ? 'Verifying…' : 'Verify code' }}
        </button>
      </form>
    </main>
  `,
  styleUrl: './totp.scss',
})
export class TotpChallengeComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected submit(): void {
    if (this.submitting() || this.form.invalid) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.api
      .completeTotpChallenge(this.form.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.form.reset();
          this.auth.setSession(response);
          void this.auth.load().then(() => this.router.navigateByUrl('/dashboard'));
        },
        error: (error: unknown) => {
          const { status } = describeApiError(error);
          this.form.reset();
          this.submitting.set(false);
          this.errorMessage.set(
            status === 429
              ? 'Too many attempts. Try again later.'
              : 'The authentication code is invalid or has expired.',
          );
        },
      });
  }
}
