// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { apiFailure } from '../../__fixtures__/admin-users';
import { AuthService } from '../../core/auth/auth.service';
import { AdminApi, type SecuritySettings } from '../../core/http/admin-api.service';
import { SecuritySettingsComponent } from './security-settings.component';

const SETTINGS: SecuritySettings = {
  minPasswordLength: 12,
  rejectPersonalDataInPassword: false,
  passwordMaxAgeDays: null,
  sessionIdleTimeoutMinutes: 15,
  maxFailedLoginAttempts: 5,
  ipFailedAttemptLimit: 20,
  sprayingDistinctLoginThreshold: 8,
  securityEventRetentionDays: 90,
};
const CUSTOM: SecuritySettings = {
  minPasswordLength: 20,
  rejectPersonalDataInPassword: true,
  passwordMaxAgeDays: 90,
  sessionIdleTimeoutMinutes: 30,
  maxFailedLoginAttempts: 10,
  ipFailedAttemptLimit: 100,
  sprayingDistinctLoginThreshold: 15,
  securityEventRetentionDays: 120,
};
const MAY_UPDATE = ['security-settings:read', 'security-settings:update'];

const FIELD = {
  minLength: 'min-password-length',
  personalData: 'reject-personal-data',
  maxAge: 'max-age',
  maxAgeOff: 'max-age-disabled',
  idle: 'idle-timeout',
  maxFailed: 'max-failed-attempts',
  ipLimit: 'ip-limit',
  spraying: 'spraying-threshold',
  retention: 'event-retention',
} as const;
type FieldName = keyof typeof FIELD;

interface Overrides {
  get?: () => Observable<SecuritySettings>;
  update?: (changes: Partial<SecuritySettings>) => Observable<SecuritySettings>;
  granted?: string[];
}

function setUp({ get, update, granted = MAY_UPDATE }: Overrides = {}) {
  const api = {
    getSecuritySettings: vi.fn(get ?? ((): Observable<SecuritySettings> => of(SETTINGS))),
    updateSecuritySettings: vi.fn(
      update ??
        ((changes: Partial<SecuritySettings>): Observable<SecuritySettings> =>
          of({ ...SETTINGS, ...changes })),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: AdminApi, useValue: api },
      { provide: AuthService, useValue: { has: (p: string) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(SecuritySettingsComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const input = (name: FieldName) => root.querySelector(`#${FIELD[name]}`) as HTMLInputElement;
  const t = {
    api,
    root,
    input,
    text: () => root.textContent ?? '',
    flush: () => fixture.detectChanges(),
    value: (name: FieldName) => input(name).value,
    checked: (name: FieldName) => input(name).checked,
    type(name: FieldName, value: string) {
      input(name).value = value;
      input(name).dispatchEvent(new Event('input'));
      fixture.detectChanges();
    },
    tick(name: FieldName, checked: boolean) {
      input(name).checked = checked;
      input(name).dispatchEvent(new Event('change'));
      fixture.detectChanges();
    },
    blur(name: FieldName) {
      input(name).dispatchEvent(new Event('blur'));
      fixture.detectChanges();
    },
    error: (name: FieldName) => root.querySelector(`#${FIELD[name]}-error`)?.textContent?.trim(),
    save() {
      (root.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.click();
      fixture.detectChanges();
    },
    saveButton: () => root.querySelector('button[type="submit"]') as HTMLButtonElement | null,
    alert: () => root.querySelector('[role="alert"]')?.textContent?.trim(),
    status: () => root.querySelector('[role="status"]')?.textContent?.trim(),
    sent: () => api.updateSecuritySettings.mock.calls.map(([changes]) => changes),
  };
  return t;
}

describe('SecuritySettingsComponent: showing the settings', () => {
  it('asks the server once for the settings, and for nothing else', () => {
    const t = setUp();

    expect(t.api.getSecuritySettings).toHaveBeenCalledOnce();
    expect(t.api.updateSecuritySettings).not.toHaveBeenCalled();
  });

  it('shows the eight settings as the server reports them', () => {
    const t = setUp({ get: () => of(CUSTOM) });

    expect(t.root.querySelector('h1')?.textContent).toBe('Security settings');
    expect(t.value('minLength')).toBe('20');
    expect(t.checked('personalData')).toBe(true);
    expect(t.value('maxAge')).toBe('90');
    expect(t.value('idle')).toBe('30');
    expect(t.value('maxFailed')).toBe('10');
    expect(t.value('ipLimit')).toBe('100');
    expect(t.value('spraying')).toBe('15');
    expect(t.value('retention')).toBe('120');
  });

  it('shows a "Login protection" group with the fixed lock duration and window as read-only text', () => {
    const t = setUp();
    const group = t.root.querySelector('fieldset') as HTMLFieldSetElement;

    expect(group.querySelector('legend')?.textContent).toBe('Login protection');
    expect(group.textContent).toContain('Lock duration: 15 minutes · attempt window: 15 minutes');
    expect(group.querySelectorAll('input[type="number"]')).toHaveLength(4);
    expect(group.querySelectorAll('input:not([type="number"])')).toHaveLength(0);
  });

  it('shows a switched-off rule as off', () => {
    const t = setUp();

    expect(t.checked('personalData')).toBe(false);
  });

  it('shows disabled password expiry as a ticked "Disabled" and an empty, switched-off field', () => {
    const t = setUp();

    expect(t.checked('maxAgeOff')).toBe(true);
    expect(t.input('maxAge').disabled).toBe(true);
    expect(t.value('maxAge')).toBe('');
  });

  it('shows enabled password expiry as an unticked "Disabled" and a field that can be edited', () => {
    const t = setUp({ get: () => of(CUSTOM) });

    expect(t.checked('maxAgeOff')).toBe(false);
    expect(t.input('maxAge').disabled).toBe(false);
  });

  it('says "loading" until the answer arrives, and shows no form before it', () => {
    const t = setUp({ get: () => new Subject<SecuritySettings>() });

    expect(t.status()).toBe('Loading the settings…');
    expect(t.root.querySelector('form')).toBeNull();
  });

  it.each([
    [500, 'Could not load the settings. Something went wrong. Try again.'],
    [403, 'Could not load the settings. You are not allowed to do this.'],
    [401, 'Could not load the settings. Your session has ended. Sign in again.'],
  ])('says so when loading fails with %i, and offers no form', (status, message) => {
    const t = setUp({ get: () => throwError(() => apiFailure(status)) });

    expect(t.alert()).toBe(message);
    expect(t.root.querySelector('form')).toBeNull();
  });

  it('tells the administrator when each setting takes effect', () => {
    const t = setUp();
    const hint = (id: string) => t.root.querySelector(`#${id}-hint`)?.textContent ?? '';

    expect(hint(FIELD.minLength)).toContain('next password change');
    expect(hint(FIELD.maxAge)).toContain('next sign-in');
    expect(hint(FIELD.idle)).toContain('open now');
    expect(hint(FIELD.maxFailed)).toContain('next login attempt');
    expect(hint(FIELD.ipLimit)).toContain('next login attempt');
    expect(hint(FIELD.spraying)).toContain('next login attempt');
    expect(hint(FIELD.retention)).toContain('next clean-up');
    expect(t.text()).toContain('first or last name');
  });
});

describe('SecuritySettingsComponent: saving', () => {
  it('sends all eight settings, as the right types', () => {
    const t = setUp({ get: () => of(CUSTOM) });
    t.type('minLength', '16');
    t.tick('personalData', false);
    t.type('maxAge', '45');
    t.type('idle', '5');
    t.type('maxFailed', '3');
    t.type('ipLimit', '250');
    t.type('spraying', '20');
    t.type('retention', '30');

    t.save();

    expect(t.sent()).toStrictEqual([
      {
        minPasswordLength: 16,
        rejectPersonalDataInPassword: false,
        passwordMaxAgeDays: 45,
        sessionIdleTimeoutMinutes: 5,
        maxFailedLoginAttempts: 3,
        ipFailedAttemptLimit: 250,
        sprayingDistinctLoginThreshold: 20,
        securityEventRetentionDays: 30,
      },
    ]);
  });

  it('sends what is shown even when nothing was edited', () => {
    const t = setUp({ get: () => of(CUSTOM) });

    t.save();

    expect(t.sent()).toStrictEqual([CUSTOM]);
  });

  it('turns the personal-data rule on', () => {
    const t = setUp();
    t.tick('personalData', true);

    t.save();

    expect(t.sent()[0]).toMatchObject({ rejectPersonalDataInPassword: true });
  });

  it('sends null for the maximum age when "Disabled" is ticked, whatever the field still holds', () => {
    const t = setUp({ get: () => of(CUSTOM) });
    t.tick('maxAgeOff', true);

    t.save();

    expect(t.sent()[0]).toMatchObject({ passwordMaxAgeDays: null });
    expect(t.input('maxAge').disabled).toBe(true);
  });

  it('turns expiry back on: unticking "Disabled" re-enables the field, which then needs a number', () => {
    const t = setUp();
    t.tick('maxAgeOff', false);
    expect(t.input('maxAge').disabled).toBe(false);

    t.save();

    expect(t.sent()).toHaveLength(0);
    expect(t.error('maxAge')).toBe('Enter a number of days, or tick "Disabled".');

    t.type('maxAge', '60');
    t.save();
    expect(t.sent()[0]).toMatchObject({ passwordMaxAgeDays: 60 });
  });

  it('shows what the server stored, not what was typed, and says it saved', () => {
    const t = setUp({ update: () => of({ ...SETTINGS, minPasswordLength: 20 }) });
    t.type('minLength', '16');

    t.save();

    expect(t.value('minLength')).toBe('20');
    expect(t.status()).toBe('Settings saved.');
    expect(t.alert()).toBeUndefined();
  });

  it('shows a maximum age the server turned off as "Disabled"', () => {
    const t = setUp({
      get: () => of(CUSTOM),
      update: () => of({ ...CUSTOM, passwordMaxAgeDays: null }),
    });

    t.save();

    expect(t.checked('maxAgeOff')).toBe(true);
    expect(t.input('maxAge').disabled).toBe(true);
  });

  it('takes one save at a time, and offers the button again when it is done', () => {
    const answer = new Subject<SecuritySettings>();
    const t = setUp({ update: () => answer });

    t.save();
    expect(t.saveButton()?.disabled).toBe(true);
    t.save(); // a second click while the first is in flight
    // The button is off, so a click never gets through; the form itself must refuse as well
    // (Enter in a field, a script), or two saves could overlap.
    t.root.querySelector('form')?.dispatchEvent(new Event('submit'));
    expect(t.sent()).toHaveLength(1);

    answer.next(SETTINGS);
    t.flush();
    expect(t.saveButton()?.disabled).toBe(false);
  });
});

describe('SecuritySettingsComponent: what is checked before anything is sent', () => {
  it.each([
    ['minLength', '11', 'Use at least 12 characters: shorter passwords are never allowed.'],
    ['minLength', '0', 'Use at least 12 characters: shorter passwords are never allowed.'],
    ['minLength', '129', 'Use at most 128 characters.'],
    ['minLength', '12.5', 'Use a whole number.'],
    ['minLength', '', 'Enter a minimum length.'],
    ['idle', '0', 'Use at least 1 minute.'],
    ['idle', '1441', 'Use at most 1440 minutes.'],
    ['idle', '1.5', 'Use a whole number.'],
    ['idle', '', 'Enter a number of minutes.'],
    ['maxAge', '0', 'Use at least 1 day.'],
    ['maxAge', '3651', 'Use at most 3650 days.'],
    ['maxAge', '30.5', 'Use a whole number.'],
    ['maxFailed', '2', 'Use at least 3 attempts.'],
    ['maxFailed', '21', 'Use at most 20 attempts.'],
    ['maxFailed', '2.5', 'Use a whole number.'],
    ['maxFailed', '', 'Enter a number of attempts.'],
    ['ipLimit', '4', 'Use at least 5 attempts.'],
    ['ipLimit', '501', 'Use at most 500 attempts.'],
    ['ipLimit', '', 'Enter a number of attempts.'],
    ['spraying', '2', 'Use at least 3 logins.'],
    ['spraying', '51', 'Use at most 50 logins.'],
    ['spraying', '', 'Enter a number of logins.'],
    ['retention', '6', 'Use at least 7 days.'],
    ['retention', '366', 'Use at most 365 days.'],
    ['retention', '', 'Enter a number of days.'],
  ] as [FieldName, string, string][])(
    'refuses %s = "%s" with its own message and sends nothing',
    (name, value, message) => {
      const t = setUp({ get: () => of(CUSTOM) });
      t.type(name, value);

      t.save();

      expect(t.error(name)).toBe(message);
      expect(t.sent()).toHaveLength(0);
    },
  );

  it.each([
    ['minLength', '12', 'minPasswordLength', 12],
    ['minLength', '128', 'minPasswordLength', 128],
    ['idle', '1', 'sessionIdleTimeoutMinutes', 1],
    ['idle', '1440', 'sessionIdleTimeoutMinutes', 1440],
    ['maxAge', '1', 'passwordMaxAgeDays', 1],
    ['maxAge', '3650', 'passwordMaxAgeDays', 3650],
    ['maxFailed', '3', 'maxFailedLoginAttempts', 3],
    ['maxFailed', '20', 'maxFailedLoginAttempts', 20],
    ['ipLimit', '5', 'ipFailedAttemptLimit', 5],
    ['ipLimit', '500', 'ipFailedAttemptLimit', 500],
    ['spraying', '3', 'sprayingDistinctLoginThreshold', 3],
    ['spraying', '50', 'sprayingDistinctLoginThreshold', 50],
    ['retention', '7', 'securityEventRetentionDays', 7],
    ['retention', '365', 'securityEventRetentionDays', 365],
  ] as [FieldName, string, keyof SecuritySettings, number][])(
    'accepts the limit itself: %s = %s',
    (name, value, key, sent) => {
      const t = setUp({ get: () => of(CUSTOM) });
      t.type(name, value);

      t.save();

      expect(t.sent()[0]).toMatchObject({ [key]: sent });
    },
  );

  it('says nothing about a field the user has not been to yet', () => {
    const t = setUp({ get: () => of(CUSTOM) });

    expect(t.root.querySelectorAll('.error')).toHaveLength(0);
  });

  it('shows the message once the user leaves the field, and marks it for assistive technology', () => {
    const t = setUp({ get: () => of(CUSTOM) });
    t.type('minLength', '5');
    expect(t.error('minLength')).toBeUndefined();

    t.blur('minLength');

    expect(t.error('minLength')).toContain('Use at least 12');
    expect(t.input('minLength').getAttribute('aria-invalid')).toBe('true');
    expect(t.input('minLength').getAttribute('aria-describedby')).toBe(
      'min-password-length-hint min-password-length-error',
    );
  });

  it('does not mark a valid field', () => {
    const t = setUp({ get: () => of(CUSTOM) });

    t.blur('minLength');

    expect(t.input('minLength').hasAttribute('aria-invalid')).toBe(false);
    expect(t.input('minLength').getAttribute('aria-describedby')).toBe('min-password-length-hint');
  });

  it('ignores a maximum age that is switched off, even an invalid one', () => {
    const t = setUp({ get: () => of(CUSTOM) });
    t.type('maxAge', '0');
    t.tick('maxAgeOff', true);

    t.save();

    expect(t.error('maxAge')).toBeUndefined();
    expect(t.sent()[0]).toMatchObject({ passwordMaxAgeDays: null });
  });

  it('keeps an invalid field from blocking the others, but sends nothing until all are right', () => {
    const t = setUp({ get: () => of(CUSTOM) });
    t.type('minLength', '11');
    t.type('idle', '0');

    t.save();

    expect(t.error('minLength')).toBeDefined();
    expect(t.error('idle')).toBeDefined();
    expect(t.sent()).toHaveLength(0);
  });
});

describe('SecuritySettingsComponent: when the server refuses', () => {
  it('says the values were rejected, keeps what was typed, and lets the user try again', () => {
    const t = setUp({ update: () => throwError(() => apiFailure(400, 'VALIDATION_ERROR')) });
    t.type('minLength', '16');

    t.save();

    expect(t.alert()).toBe('The server rejected the data. Check the form and try again.');
    expect(t.value('minLength')).toBe('16');
    expect(t.status()).toBeUndefined();
    expect(t.saveButton()?.disabled).toBe(false);
  });

  it.each([
    [403, 'You are not allowed to do this.'],
    [401, 'Your session has ended. Sign in again.'],
    [500, 'Something went wrong. Try again.'],
  ])('explains a %i', (status, message) => {
    const t = setUp({ update: () => throwError(() => apiFailure(status)) });

    t.save();

    expect(t.alert()).toBe(message);
  });

  it('forgets an earlier refusal, and an earlier success, when the next save starts', () => {
    let fail = true;
    const t = setUp({
      update: (changes) =>
        fail ? throwError(() => apiFailure(500)) : of({ ...SETTINGS, ...changes }),
    });
    t.save();
    expect(t.alert()).toBeDefined();

    fail = false;
    t.save();

    expect(t.alert()).toBeUndefined();
    expect(t.status()).toBe('Settings saved.');
    fail = true;
    t.save();
    expect(t.status()).toBeUndefined();
  });
});

describe('SecuritySettingsComponent: who may change the settings', () => {
  it('offers Save to someone who may update them', () => {
    const t = setUp();

    expect(t.saveButton()?.textContent?.trim()).toBe('Save settings');
    expect(t.input('minLength').disabled).toBe(false);
  });

  it('shows the settings read-only to someone who may only read them', () => {
    const t = setUp({ granted: ['security-settings:read'], get: () => of(CUSTOM) });

    expect(t.value('minLength')).toBe('20');
    expect(t.saveButton()).toBeNull();
    for (const name of [
      'minLength',
      'personalData',
      'maxAge',
      'maxAgeOff',
      'idle',
      'maxFailed',
      'ipLimit',
      'spraying',
      'retention',
    ] as const) {
      expect(t.input(name).disabled, name).toBe(true);
    }
  });
});
