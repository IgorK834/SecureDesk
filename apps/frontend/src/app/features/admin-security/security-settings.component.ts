import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type SecuritySettings } from '../../core/http/admin-api.service';
import { actionErrorMessage } from '../admin-users/error-messages';

// These mirror the server's limits (`server/security/schemas.ts`) so that a mistake is shown before
// the request is sent. They are a convenience only: the server validates everything again, and is
// the only judge. It answers a rejected value with a bare 400, which is shown as a form-level
// message, since it names no field.
const LIMITS = {
  minPasswordLength: { min: 12, max: 128 },
  passwordMaxAgeDays: { min: 1, max: 3650 },
  sessionIdleTimeoutMinutes: { min: 1, max: 1440 },
  maxFailedLoginAttempts: { min: 3, max: 20 },
  ipFailedAttemptLimit: { min: 5, max: 500 },
  sprayingDistinctLoginThreshold: { min: 3, max: 50 },
  securityEventRetentionDays: { min: 7, max: 365 },
} as const;
type NumberField = keyof typeof LIMITS;

const wholeNumberWithin =
  (field: NumberField): ValidatorFn =>
  (control): ValidationErrors | null => {
    const value = control.value as number | null;
    if (value === null) return { required: true };
    if (!Number.isInteger(value)) return { integer: true };
    if (value < LIMITS[field].min) return { min: true };
    return value > LIMITS[field].max ? { max: true } : null;
  };

const MESSAGES: Record<NumberField, Record<string, string>> = {
  minPasswordLength: {
    required: 'Enter a minimum length.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.minPasswordLength.min} characters: shorter passwords are never allowed.`,
    max: `Use at most ${LIMITS.minPasswordLength.max} characters.`,
  },
  passwordMaxAgeDays: {
    required: 'Enter a number of days, or tick "Disabled".',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.passwordMaxAgeDays.min} day.`,
    max: `Use at most ${LIMITS.passwordMaxAgeDays.max} days.`,
  },
  sessionIdleTimeoutMinutes: {
    required: 'Enter a number of minutes.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.sessionIdleTimeoutMinutes.min} minute.`,
    max: `Use at most ${LIMITS.sessionIdleTimeoutMinutes.max} minutes.`,
  },
  maxFailedLoginAttempts: {
    required: 'Enter a number of attempts.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.maxFailedLoginAttempts.min} attempts.`,
    max: `Use at most ${LIMITS.maxFailedLoginAttempts.max} attempts.`,
  },
  ipFailedAttemptLimit: {
    required: 'Enter a number of attempts.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.ipFailedAttemptLimit.min} attempts.`,
    max: `Use at most ${LIMITS.ipFailedAttemptLimit.max} attempts.`,
  },
  sprayingDistinctLoginThreshold: {
    required: 'Enter a number of logins.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.sprayingDistinctLoginThreshold.min} logins.`,
    max: `Use at most ${LIMITS.sprayingDistinctLoginThreshold.max} logins.`,
  },
  securityEventRetentionDays: {
    required: 'Enter a number of days.',
    integer: 'Use a whole number.',
    min: `Use at least ${LIMITS.securityEventRetentionDays.min} days.`,
    max: `Use at most ${LIMITS.securityEventRetentionDays.max} days.`,
  },
};

/**
 * The global security settings (routed at `/admin/security`): password rules, password expiry,
 * the idle timeout and the login protection (failed-attempt limits and event retention). Saving
 * sends all eight values and shows what the server stored. Which rule applies when is said next to
 * each field, because it differs: a new idle timeout reaches sessions that are open now, a new
 * maximum age applies at the next sign-in, the password rules at the next password change, and the
 * login-protection limits at the next login attempt (or, for the retention, the next purge). The
 * lock duration and the attempt window are fixed by the assignment, so they are text, not fields.
 */
@Component({
  selector: 'app-security-settings',
  imports: [ReactiveFormsModule],
  template: `
    <h1>Security settings</h1>

    @if (loadError(); as text) {
      <p role="alert" aria-live="assertive" class="error">{{ text }}</p>
    } @else if (!loaded()) {
      <p role="status">Loading the settings…</p>
    } @else {
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="field">
          <label for="min-password-length">Minimum password length</label>
          <input
            id="min-password-length"
            type="number"
            formControlName="minPasswordLength"
            [attr.aria-invalid]="message('minPasswordLength') ? true : null"
            [attr.aria-describedby]="
              message('minPasswordLength')
                ? 'min-password-length-hint min-password-length-error'
                : 'min-password-length-hint'
            "
          />
          <p id="min-password-length-hint" class="hint">
            Characters, from 12 to 128. Applies to the next password change.
          </p>
          @if (message('minPasswordLength'); as text) {
            <p id="min-password-length-error" class="error">{{ text }}</p>
          }
        </div>

        <div class="field">
          <label for="reject-personal-data">
            <input
              id="reject-personal-data"
              type="checkbox"
              role="switch"
              formControlName="rejectPersonalDataInPassword"
            />
            Reject passwords that contain the user's first or last name
          </label>
          <p class="hint">Applies to the next password change.</p>
        </div>

        <div class="field">
          <label for="max-age">Maximum password age (days)</label>
          <input
            id="max-age"
            type="number"
            formControlName="passwordMaxAgeDays"
            [attr.aria-invalid]="message('passwordMaxAgeDays') ? true : null"
            [attr.aria-describedby]="
              message('passwordMaxAgeDays') ? 'max-age-hint max-age-error' : 'max-age-hint'
            "
          />
          <label for="max-age-disabled">
            <input id="max-age-disabled" type="checkbox" formControlName="maxAgeDisabled" />
            Disabled
          </label>
          <p id="max-age-hint" class="hint">
            From 1 to 3650 days. Passwords never expire while this is disabled. Applies at the next
            sign-in.
          </p>
          @if (message('passwordMaxAgeDays'); as text) {
            <p id="max-age-error" class="error">{{ text }}</p>
          }
        </div>

        <div class="field">
          <label for="idle-timeout">Idle timeout (minutes)</label>
          <input
            id="idle-timeout"
            type="number"
            formControlName="sessionIdleTimeoutMinutes"
            [attr.aria-invalid]="message('sessionIdleTimeoutMinutes') ? true : null"
            [attr.aria-describedby]="
              message('sessionIdleTimeoutMinutes')
                ? 'idle-timeout-hint idle-timeout-error'
                : 'idle-timeout-hint'
            "
          />
          <p id="idle-timeout-hint" class="hint">
            Minutes without activity before a session ends, from 1 to 1440. Applies to sessions that
            are open now, at their next request.
          </p>
          @if (message('sessionIdleTimeoutMinutes'); as text) {
            <p id="idle-timeout-error" class="error">{{ text }}</p>
          }
        </div>

        <fieldset class="group">
          <legend>Login protection</legend>
          <p class="hint">Lock duration: 15 minutes · attempt window: 15 minutes</p>

          <div class="field">
            <label for="max-failed-attempts">Failed attempts before an account is locked</label>
            <input
              id="max-failed-attempts"
              type="number"
              formControlName="maxFailedLoginAttempts"
              [attr.aria-invalid]="message('maxFailedLoginAttempts') ? true : null"
              [attr.aria-describedby]="
                message('maxFailedLoginAttempts')
                  ? 'max-failed-attempts-hint max-failed-attempts-error'
                  : 'max-failed-attempts-hint'
              "
            />
            <p id="max-failed-attempts-hint" class="hint">
              Failed attempts for one login within the window, from 3 to 20. Applies to the next
              login attempt.
            </p>
            @if (message('maxFailedLoginAttempts'); as text) {
              <p id="max-failed-attempts-error" class="error">{{ text }}</p>
            }
          </div>

          <div class="field">
            <label for="ip-limit">Failed attempts before an IP address is blocked</label>
            <input
              id="ip-limit"
              type="number"
              formControlName="ipFailedAttemptLimit"
              [attr.aria-invalid]="message('ipFailedAttemptLimit') ? true : null"
              [attr.aria-describedby]="
                message('ipFailedAttemptLimit') ? 'ip-limit-hint ip-limit-error' : 'ip-limit-hint'
              "
            />
            <p id="ip-limit-hint" class="hint">
              Failed attempts from one address within the window, whatever the logins, from 5 to
              500. Applies to the next login attempt.
            </p>
            @if (message('ipFailedAttemptLimit'); as text) {
              <p id="ip-limit-error" class="error">{{ text }}</p>
            }
          </div>

          <div class="field">
            <label for="spraying-threshold">Distinct logins that signal password spraying</label>
            <input
              id="spraying-threshold"
              type="number"
              formControlName="sprayingDistinctLoginThreshold"
              [attr.aria-invalid]="message('sprayingDistinctLoginThreshold') ? true : null"
              [attr.aria-describedby]="
                message('sprayingDistinctLoginThreshold')
                  ? 'spraying-threshold-hint spraying-threshold-error'
                  : 'spraying-threshold-hint'
              "
            />
            <p id="spraying-threshold-hint" class="hint">
              Different logins failed from one address within the window, from 3 to 50, raise a
              security event. Applies to the next login attempt.
            </p>
            @if (message('sprayingDistinctLoginThreshold'); as text) {
              <p id="spraying-threshold-error" class="error">{{ text }}</p>
            }
          </div>

          <div class="field">
            <label for="event-retention">Security event retention (days)</label>
            <input
              id="event-retention"
              type="number"
              formControlName="securityEventRetentionDays"
              [attr.aria-invalid]="message('securityEventRetentionDays') ? true : null"
              [attr.aria-describedby]="
                message('securityEventRetentionDays')
                  ? 'event-retention-hint event-retention-error'
                  : 'event-retention-hint'
              "
            />
            <p id="event-retention-hint" class="hint">
              Days a security event is kept, from 7 to 365. Applies at the next clean-up.
            </p>
            @if (message('securityEventRetentionDays'); as text) {
              <p id="event-retention-error" class="error">{{ text }}</p>
            }
          </div>
        </fieldset>

        @if (formError(); as text) {
          <p role="alert" aria-live="assertive" class="error">{{ text }}</p>
        }
        @if (notice(); as text) {
          <p role="status" aria-live="polite">{{ text }}</p>
        }

        @if (auth.has('security-settings:update')) {
          <button type="submit" [disabled]="busy()">Save settings</button>
        }
      </form>
    }
  `,
  styles: `
    .field {
      display: flex;
      flex-direction: column;
      margin-block: 0.75em;
      max-width: 28em;
    }
    .group {
      margin-block: 1em;
      max-width: 30em;
    }
    .hint {
      margin: 0.25em 0 0;
    }
    .error {
      margin: 0.25em 0 0;
      color: #b3261e;
    }
  `,
})
export class SecuritySettingsComponent {
  private readonly api = inject(AdminApi);
  protected readonly auth = inject(AuthService);

  protected readonly form = new FormGroup({
    minPasswordLength: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('minPasswordLength')],
    }),
    rejectPersonalDataInPassword: new FormControl(false, { nonNullable: true }),
    /** Not a setting of its own: ticked, the maximum age is `null` and its field is off. */
    maxAgeDisabled: new FormControl(false, { nonNullable: true }),
    passwordMaxAgeDays: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('passwordMaxAgeDays')],
    }),
    sessionIdleTimeoutMinutes: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('sessionIdleTimeoutMinutes')],
    }),
    maxFailedLoginAttempts: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('maxFailedLoginAttempts')],
    }),
    ipFailedAttemptLimit: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('ipFailedAttemptLimit')],
    }),
    sprayingDistinctLoginThreshold: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('sprayingDistinctLoginThreshold')],
    }),
    securityEventRetentionDays: new FormControl<number | null>(null, {
      validators: [wholeNumberWithin('securityEventRetentionDays')],
    }),
  });

  protected readonly loaded = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  constructor() {
    // A disabled field takes no part in validation, so "Disabled" cannot leave an error behind.
    this.form.controls.maxAgeDisabled.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((disabled) => {
        const age = this.form.controls.passwordMaxAgeDays;
        if (disabled) age.disable();
        else age.enable();
      });

    this.api
      .getSecuritySettings()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (settings) => {
          this.show(settings);
          // Without the permission to change the settings the form is there to read, not to edit.
          if (!this.auth.has('security-settings:update')) this.form.disable();
          this.loaded.set(true);
        },
        error: (error: unknown) =>
          this.loadError.set(`Could not load the settings. ${actionErrorMessage(error)}`),
      });
  }

  /** The text for a field that is wrong, once the user has been to it or tried to save. */
  protected message(field: NumberField): string | null {
    const control = this.form.controls[field];
    if (!control.errors || !(control.touched || this.submitted())) return null;
    const [code] = Object.keys(control.errors);
    return (code && MESSAGES[field][code]) || null;
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.busy() || this.form.invalid) return;

    const value = this.form.getRawValue();
    this.busy.set(true);
    this.notice.set(null);
    this.formError.set(null);
    this.api
      .updateSecuritySettings({
        minPasswordLength: value.minPasswordLength as number,
        rejectPersonalDataInPassword: value.rejectPersonalDataInPassword,
        passwordMaxAgeDays: value.maxAgeDisabled ? null : (value.passwordMaxAgeDays as number),
        sessionIdleTimeoutMinutes: value.sessionIdleTimeoutMinutes as number,
        maxFailedLoginAttempts: value.maxFailedLoginAttempts as number,
        ipFailedAttemptLimit: value.ipFailedAttemptLimit as number,
        sprayingDistinctLoginThreshold: value.sprayingDistinctLoginThreshold as number,
        securityEventRetentionDays: value.securityEventRetentionDays as number,
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.submitted.set(false);
          this.show(saved);
          this.notice.set('Settings saved.');
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.formError.set(actionErrorMessage(error));
        },
      });
  }

  /** Fills the form with what the server holds, so the page never shows what it did not store. */
  private show(settings: SecuritySettings): void {
    this.form.reset({
      minPasswordLength: settings.minPasswordLength,
      rejectPersonalDataInPassword: settings.rejectPersonalDataInPassword,
      maxAgeDisabled: settings.passwordMaxAgeDays === null,
      passwordMaxAgeDays: settings.passwordMaxAgeDays,
      sessionIdleTimeoutMinutes: settings.sessionIdleTimeoutMinutes,
      maxFailedLoginAttempts: settings.maxFailedLoginAttempts,
      ipFailedAttemptLimit: settings.ipFailedAttemptLimit,
      sprayingDistinctLoginThreshold: settings.sprayingDistinctLoginThreshold,
      securityEventRetentionDays: settings.securityEventRetentionDays,
    });
  }
}
