import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorDetails, describeApiError } from '../../core/http/api-error';

const INVALID_CREDENTIALS = 'Login lub hasło niepoprawne';
const TOO_MANY_ATTEMPTS = 'Too many attempts, try again later';
type BlockKind = 'account' | 'ip';

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

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
  private readonly destroyRef = inject(DestroyRef);
  private countdownTimer: ReturnType<typeof setInterval> | undefined;
  private countdownDeadline = 0;

  readonly form = this.fb.nonNullable.group({
    login: ['', [Validators.required, Validators.maxLength(64)]],
    password: ['', [Validators.required]],
  });
  readonly submitting = signal(false);
  protected readonly submitted = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly countdownSeconds = signal<number | null>(null);
  private readonly blockKind = signal<BlockKind | null>(null);
  protected readonly countdownAnnouncement = signal<string | null>(null);
  protected readonly countdownActive = computed(() => (this.countdownSeconds() ?? 0) > 0);
  protected readonly countdownMessage = computed(() => {
    const seconds = this.countdownSeconds();
    const kind = this.blockKind();
    if (seconds === null || kind === null) return null;
    const prefix =
      kind === 'account' ? 'Too many failed attempts.' : 'Too many attempts from this network.';
    return `${prefix} Try again in ${duration(seconds)}.`;
  });
  protected readonly banner = this.reasonBanner(this.route.snapshot.queryParamMap.get('reason'));

  constructor() {
    this.destroyRef.onDestroy(() => this.stopCountdown());
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.submitting() || this.countdownActive() || this.form.invalid) return;

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.stopCountdown();
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
        const { status, code } = describeApiError(error);
        const { retryAfterSeconds } = apiErrorDetails(error);
        this.form.controls.password.reset();
        this.submitting.set(false);
        if (
          status === 429 &&
          (code === 'AUTH_ACCOUNT_LOCKED' || code === 'AUTH_IP_BLOCKED') &&
          retryAfterSeconds !== undefined
        ) {
          this.startCountdown(code === 'AUTH_ACCOUNT_LOCKED' ? 'account' : 'ip', retryAfterSeconds);
          return;
        }
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

  private startCountdown(kind: BlockKind, seconds: number): void {
    this.stopCountdown();
    this.blockKind.set(kind);
    this.countdownSeconds.set(seconds);
    this.countdownDeadline = performance.now() + seconds * 1000;
    this.countdownAnnouncement.set(this.countdownMessage());
    if (seconds === 0) {
      this.countdownAnnouncement.set('You can try again now');
      return;
    }

    this.countdownTimer = setInterval(() => {
      const previous = this.countdownSeconds() ?? 0;
      const remaining = Math.max(0, Math.ceil((this.countdownDeadline - performance.now()) / 1000));
      if (remaining === previous) return;
      this.countdownSeconds.set(remaining);
      if (remaining === 0) {
        this.countdownAnnouncement.set('You can try again now');
        this.clearCountdownTimer();
      } else if (remaining % 60 === 0) {
        this.countdownAnnouncement.set(this.countdownMessage());
      }
    }, 250);
  }

  private clearCountdownTimer(): void {
    if (this.countdownTimer !== undefined) clearInterval(this.countdownTimer);
    this.countdownTimer = undefined;
  }

  private stopCountdown(): void {
    this.clearCountdownTimer();
    this.countdownSeconds.set(null);
    this.blockKind.set(null);
    this.countdownAnnouncement.set(null);
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
