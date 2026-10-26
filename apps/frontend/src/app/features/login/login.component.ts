import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';

const INVALID_CREDENTIALS = 'Login lub hasło niepoprawne';
const TOO_MANY_ATTEMPTS = 'Too many attempts, try again later';

function acceptedReturnUrl(value: string | null): string | null {
  return value?.startsWith('/') && !value.startsWith('//') ? value : null;
}

/** Public sign-in page. Credentials exist only in this form and the one request body. */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required]],
  });
  readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly banner = this.reasonBanner(this.route.snapshot.queryParamMap.get('reason'));

  protected submit(): void {
    this.submitted.set(true);
    if (this.submitting() || this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    const { login, password } = this.form.getRawValue();
    this.api.login({ login: login.trim(), password }).subscribe({
      next: (response) => {
        this.auth.setSession(response);
        const destination =
          response.authStage === 'INITIAL_PASSWORD_CHANGE'
            ? '/change-initial-password'
            : response.authStage === 'PASSWORD_EXPIRED'
              ? '/account/change-password'
              : response.authStage === 'TOTP_CHALLENGE'
                ? '/totp-challenge'
                : acceptedReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')) ||
                  '/dashboard';
        const finish = () => {
          this.submitting.set(false);
          void this.router.navigateByUrl(destination);
        };
        // A login response intentionally contains no permission list. Refresh the safe session
        // view before exposing authenticated navigation, without requiring a page reload.
        if (response.authStage === 'FULLY_AUTHENTICATED') void this.auth.load().then(finish);
        else finish();
      },
      error: (error: unknown) => {
        const { status } = describeApiError(error);
        this.form.controls.password.reset();
        this.submitting.set(false);
        this.errorMessage.set(
          status === 401
            ? INVALID_CREDENTIALS
            : status === 429
              ? TOO_MANY_ATTEMPTS
              : 'Sign in is unavailable. Try again later.',
        );
      },
    });
  }

  protected fieldError(field: 'login' | 'password'): string | null {
    const control = this.form.controls[field];
    if (!(control.touched || this.submitted()) || !control.errors) return null;
    if (control.hasError('required'))
      return field === 'login' ? 'Enter your login.' : 'Enter your password.';
    return control.hasError('maxlength') ? 'Use at most 64 characters.' : null;
  }

  protected submitOnEnter(event: Event): void {
    event.preventDefault();
    this.submit();
  }

  private reasonBanner(reason: string | null): string | null {
    if (reason === 'session-expired') return 'Your session has expired due to inactivity.';
    if (reason === 'temporary-password-expired')
      return 'Your temporary password has expired. Ask an administrator to reset it.';
    return null;
  }
}
