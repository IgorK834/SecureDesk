import { Component, DestroyRef, OnDestroy, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import QRCode from 'qrcode';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { describeApiError } from '../../core/http/api-error';

@Component({
  selector: 'app-totp-settings',
  imports: [ReactiveFormsModule],
  template: `
    <main class="totp-page">
      <h1>Two-factor authentication</h1>
      <p>
        Add a time-based one-time code from an authenticator app as a second factor after your
        password.
      </p>

      <p role="status">Current status: {{ auth.totpEnabled() ? 'enabled' : 'disabled' }}.</p>

      @if (!auth.totpEnabled()) {
        <section aria-labelledby="enable-totp">
          <h2 id="enable-totp">Enable two-factor authentication</h2>
          @if (!qrDataUrl()) {
            <button type="button" [disabled]="working()" (click)="startEnrollment()">
              {{ working() ? 'Preparing…' : 'Set up authenticator' }}
            </button>
          } @else {
            <p>Scan this QR code, then enter the six-digit code shown by your app.</p>
            <img [src]="qrDataUrl()" alt="Authenticator enrollment QR code" />
            <form [formGroup]="confirmForm" (ngSubmit)="confirmEnrollment()" novalidate>
              <label for="enrollment-code">Authentication code</label>
              <input
                id="enrollment-code"
                formControlName="code"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
              />
              <button type="submit" [disabled]="working() || confirmForm.invalid">
                Confirm and enable
              </button>
              <button type="button" [disabled]="working()" (click)="cancelEnrollment()">
                Cancel
              </button>
            </form>
          }
        </section>
      }

      @if (auth.totpEnabled()) {
        <section aria-labelledby="disable-totp">
          <h2 id="disable-totp">Disable two-factor authentication</h2>
          <p>Confirm this sensitive change with your password and a fresh authenticator code.</p>
          <form [formGroup]="disableForm" (ngSubmit)="disable()" novalidate>
            <label for="totp-current-password">Current password</label>
            <input
              id="totp-current-password"
              type="password"
              formControlName="currentPassword"
              autocomplete="current-password"
            />
            <label for="disable-code">Authentication code</label>
            <input
              id="disable-code"
              formControlName="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
            />
            <button type="submit" [disabled]="working() || disableForm.invalid">Disable</button>
          </form>
        </section>
      }

      <div role="alert" aria-live="polite">
        @if (message(); as text) {
          <p [class.error]="isError()">{{ text }}</p>
        }
      </div>
    </main>
  `,
  styleUrl: './totp.scss',
})
export class TotpSettingsComponent implements OnDestroy {
  private readonly api = inject(AuthApiService);
  readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly working = signal(false);
  protected readonly qrDataUrl = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly isError = signal(false);
  readonly confirmForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });
  readonly disableForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnDestroy(): void {
    this.clearSecrets();
  }

  protected startEnrollment(): void {
    if (this.working()) return;
    this.setWorking();
    this.api
      .enrollTotp()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async ({ otpauthUri }) => {
          try {
            this.qrDataUrl.set(await QRCode.toDataURL(otpauthUri, { width: 240, margin: 1 }));
          } catch {
            this.fail('Could not render the enrollment QR code.');
            return;
          }
          this.working.set(false);
        },
        error: () => this.fail('Could not start two-factor authentication setup.'),
      });
  }

  protected confirmEnrollment(): void {
    if (this.working() || this.confirmForm.invalid) return;
    this.setWorking();
    this.api
      .verifyTotpEnrollment(this.confirmForm.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearSecrets();
          this.auth.setTotpEnabled(true);
          this.working.set(false);
          this.message.set('Two-factor authentication is enabled.');
        },
        error: () => this.fail('The authentication code is invalid or has expired.'),
      });
  }

  protected cancelEnrollment(): void {
    this.clearSecrets();
    this.message.set(null);
  }

  protected disable(): void {
    if (this.working() || this.disableForm.invalid) return;
    this.setWorking();
    this.api
      .disableTotp(this.disableForm.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.clearSecrets();
          this.auth.setTotpEnabled(false);
          this.working.set(false);
          this.message.set('Two-factor authentication is disabled.');
        },
        error: (error: unknown) => {
          const { code } = describeApiError(error);
          this.fail(
            code === 'CURRENT_PASSWORD_INCORRECT'
              ? 'The current password is incorrect.'
              : 'The authentication code is invalid or has expired.',
          );
        },
      });
  }

  private setWorking(): void {
    this.working.set(true);
    this.isError.set(false);
    this.message.set(null);
  }

  private fail(message: string): void {
    this.working.set(false);
    this.isError.set(true);
    this.message.set(message);
    this.confirmForm.reset();
    this.disableForm.reset();
  }

  private clearSecrets(): void {
    this.qrDataUrl.set(null);
    this.confirmForm.reset();
    this.disableForm.reset();
  }
}
