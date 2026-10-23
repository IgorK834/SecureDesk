// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUser, apiFailure } from '../../__fixtures__/admin-users';
import { installDialogPolyfill } from '../../__fixtures__/dialog';
import {
  AdminApi,
  type AdminUser,
  type CreateUserRequest,
  type CreatedUser,
  type UpdateUserRequest,
} from '../../core/http/admin-api.service';
import { UserFormComponent } from './user-form.component';

beforeAll(installDialogPolyfill);
afterEach(() => vi.restoreAllMocks());

const PASSWORD = 'Tmp-Secret-9xQ4zLm2';

const CREATED: CreatedUser = {
  user: adminUser({
    id: 'u-new',
    login: 'new.user',
    firstName: 'Nowy',
    lastName: 'Użytkownik',
    role: 'GUEST',
    mustChangePassword: true,
    temporaryPasswordExpiresAt: '2030-01-02T00:00:00.000Z',
    passwordChangedAt: null,
  }),
  temporaryPassword: { value: PASSWORD, expiresAt: '2030-01-02T00:00:00.000Z' },
};

const VALID = { login: 'new.user', firstName: 'Nowy', lastName: 'Użytkownik', role: 'GUEST' };

interface Overrides {
  user?: AdminUser;
  create?: (body: CreateUserRequest) => Observable<CreatedUser>;
  update?: (id: string, changes: UpdateUserRequest) => Observable<AdminUser>;
}

function setUp({ user, create, update }: Overrides = {}) {
  const createStub: (body: CreateUserRequest) => Observable<CreatedUser> =
    create ?? (() => of(CREATED));
  const api = {
    create: vi.fn(createStub),
    update: vi.fn(
      update ?? ((id: string, changes: UpdateUserRequest) => of(adminUser({ id, ...changes }))),
    ),
  };
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AdminApi, useValue: api }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(UserFormComponent);
  if (user) fixture.componentRef.setInput('user', user);
  const saved = vi.fn();
  const cancelled = vi.fn();
  fixture.componentInstance.saved.subscribe(saved);
  fixture.componentInstance.cancelled.subscribe(cancelled);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;

  const field = (id: string) =>
    root.querySelector(`#${id}`) as HTMLInputElement | HTMLSelectElement;
  const ids = {
    login: 'user-login',
    firstName: 'user-first-name',
    lastName: 'user-last-name',
    role: 'user-role',
  } as const;

  const t = {
    api,
    navigate,
    saved,
    cancelled,
    fixture,
    root,
    field,
    text: () => root.textContent ?? '',
    error: (id: keyof typeof ids) => root.querySelector(`#${ids[id]}-error`)?.textContent?.trim(),
    fill(values: Partial<Record<keyof typeof ids, string>>) {
      for (const [name, value] of Object.entries(values)) {
        const control = field(ids[name as keyof typeof ids]);
        control.value = value;
        control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
      }
      fixture.detectChanges();
    },
    blur(id: keyof typeof ids) {
      field(ids[id]).dispatchEvent(new Event('blur'));
      fixture.detectChanges();
    },
    submit() {
      (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    },
    button: (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label),
    passwordDialog: () => root.querySelector('dialog') as HTMLDialogElement,
    // Lets the promise chains that follow a click run, then renders their result.
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      fixture.detectChanges();
    },
  };
  return t;
}

describe('UserFormComponent: creating an account', () => {
  it('asks for login, first name, last name and role', () => {
    const { text, field } = setUp();

    expect(text()).toContain('New user');
    expect(field('user-login')).not.toBeNull();
    expect(field('user-first-name')).not.toBeNull();
    expect(field('user-last-name')).not.toBeNull();
    expect(field('user-role')).not.toBeNull();
  });

  it('offers Manager, Employee and Guest, and never Administrator', () => {
    const { field } = setUp();

    const options = [...(field('user-role') as HTMLSelectElement).options].map((o) => o.value);

    expect(options).toStrictEqual(['', 'MANAGER', 'EMPLOYEE', 'GUEST']);
  });

  it('sends nothing, and says what is missing, when the form is empty', () => {
    const t = setUp();

    t.submit();

    expect(t.api.create).not.toHaveBeenCalled();
    expect(t.error('login')).toBe('Enter a login.');
    expect(t.error('firstName')).toBe('Enter a first name.');
    expect(t.error('lastName')).toBe('Enter a last name.');
    expect(t.error('role')).toBe('Choose a role.');
  });

  it('marks a wrong field for assistive technology and links it to its message', () => {
    const t = setUp();

    t.submit();

    expect(t.field('user-login').getAttribute('aria-invalid')).toBe('true');
    expect(t.field('user-login').getAttribute('aria-describedby')).toBe('user-login-error');
    expect(t.root.querySelector('#user-login-error')).not.toBeNull();
  });

  it('does not shout about a field the user has not reached yet', () => {
    const t = setUp();

    expect(t.error('login')).toBeUndefined();
    t.blur('login');

    expect(t.error('login')).toBe('Enter a login.');
    expect(t.error('lastName')).toBeUndefined();
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(33)],
    ['with a space', 'new user'],
    ['with a character outside the allowed set', 'jan@firma'],
    ['with a letter outside ASCII', 'łukasz'],
  ])('refuses a login that is %s', (_why, login) => {
    const t = setUp();
    t.fill({ ...VALID, login });

    t.submit();

    expect(t.api.create).not.toHaveBeenCalled();
    expect(t.error('login')).toBe('Use 3 to 32 letters, digits, dots, underscores or hyphens.');
  });

  it.each(['abc', 'a'.repeat(32), 'Jan.Kowalski-2_x'])('accepts the login %s', (login) => {
    const t = setUp();
    t.fill({ ...VALID, login });

    t.submit();

    expect(t.api.create).toHaveBeenCalledTimes(1);
  });

  it('refuses names that are blank or longer than 64 characters', () => {
    const t = setUp();
    t.fill({ ...VALID, firstName: '   ', lastName: 'x'.repeat(65) });

    t.submit();

    expect(t.api.create).not.toHaveBeenCalled();
    expect(t.error('firstName')).toBe('Enter a first name.');
    expect(t.error('lastName')).toBe('Use at most 64 characters.');
  });

  it('accepts a name of exactly 64 characters', () => {
    const t = setUp();
    t.fill({ ...VALID, lastName: 'x'.repeat(64) });

    t.submit();

    expect(t.api.create).toHaveBeenCalledTimes(1);
  });

  it('sends the trimmed values and the chosen role', () => {
    const t = setUp();
    t.fill({
      login: '  new.user  ',
      firstName: ' Nowy ',
      lastName: ' Użytkownik ',
      role: 'MANAGER',
    });

    t.submit();

    expect(t.api.create).toHaveBeenCalledExactlyOnceWith({
      login: 'new.user',
      firstName: 'Nowy',
      lastName: 'Użytkownik',
      role: 'MANAGER',
    });
  });

  it('sends one request when the button is pressed twice before the page has re-rendered', () => {
    const inFlight = new Subject<CreatedUser>();
    const t = setUp({ create: () => inFlight });
    t.fill(VALID);
    const button = t.button('Create account') as HTMLButtonElement;

    // No change detection in between: the button is not yet disabled in the DOM, as in a fast
    // double-click. Only the component's own guard stands between this and a duplicate account.
    button.click();
    button.click();

    expect(t.api.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the button disabled while the request is in flight', () => {
    const t = setUp({ create: () => new Subject<CreatedUser>() });
    t.fill(VALID);

    t.submit();

    expect((t.button('Create account') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows no text, and not the word "undefined", for an error it has no message for', () => {
    const t = setUp();
    t.submit();

    t.fixture.componentInstance['form'].controls.login.setErrors({ unexpected: true });
    t.blur('login'); // an event is what makes a zoneless view render again

    expect(t.error('login')).toBeUndefined();
    expect(t.text()).not.toContain('undefined');
  });
});

describe('UserFormComponent: the one-time temporary password', () => {
  it('shows the password to the administrator once the account exists', () => {
    const t = setUp();
    t.fill(VALID);

    t.submit();

    expect(t.passwordDialog().hasAttribute('open')).toBe(true);
    expect(t.passwordDialog().textContent).toContain(PASSWORD);
    expect(t.passwordDialog().textContent).toContain('new.user');
    expect(t.passwordDialog().textContent).toContain('shown only once');
  });

  it('does not leave the page until the administrator confirms they saved it', async () => {
    const t = setUp();
    t.fill(VALID);

    t.submit();
    await t.settle();

    expect(t.navigate).not.toHaveBeenCalled();
  });

  it('then opens the new account, and the password is gone from the page', async () => {
    const t = setUp();
    t.fill(VALID);
    t.submit();
    t.fixture.detectChanges();

    t.button('I have saved the password')?.click();
    await t.settle();

    expect(t.navigate).toHaveBeenCalledExactlyOnceWith(['/admin/users', 'u-new']);
    expect(t.passwordDialog().hasAttribute('open')).toBe(false);
    expect(t.text()).not.toContain(PASSWORD);
    expect(t.root.innerHTML).not.toContain(PASSWORD);
  });

  it('keeps the password out of storage, the console and the form itself', async () => {
    const console_ = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ];
    const t = setUp();
    t.fill(VALID);

    t.submit();
    await t.settle();

    for (const store of [localStorage, sessionStorage]) {
      expect(JSON.stringify({ ...store })).not.toContain(PASSWORD);
    }
    expect(JSON.stringify(console_.map((spy) => spy.mock.calls))).not.toContain(PASSWORD);
    expect(JSON.stringify(t.fixture.componentInstance['form'].getRawValue())).not.toContain(
      PASSWORD,
    );
    expect(JSON.stringify(t.navigate.mock.calls)).not.toContain(PASSWORD);
  });

  it('stays unable to send again after success, so a second click cannot create a duplicate', async () => {
    const t = setUp();
    t.fill(VALID);
    t.submit();
    t.button('I have saved the password')?.click();
    await t.settle();

    t.submit();

    expect(t.api.create).toHaveBeenCalledTimes(1);
  });
});

describe('UserFormComponent: when creating fails', () => {
  it('names the login field when the login is already taken (409)', () => {
    const t = setUp({ create: () => throwError(() => apiFailure(409, 'LOGIN_ALREADY_EXISTS')) });
    t.fill(VALID);

    t.submit();

    expect(t.error('login')).toBe('This login is already in use.');
    expect(t.root.querySelector('[role="alert"]')).toBeNull();
    expect(t.passwordDialog().hasAttribute('open')).toBe(false);
  });

  it('keeps what was typed, so only the login has to change, and lets the user try again', () => {
    const answers = [
      throwError(() => apiFailure(409, 'LOGIN_ALREADY_EXISTS')),
      of(CREATED),
    ] as Observable<CreatedUser>[];
    const t = setUp({ create: () => answers.shift() as Observable<CreatedUser> });
    t.fill(VALID);
    t.submit();

    expect(t.field('user-first-name').value).toBe('Nowy');
    expect(t.field('user-role').value).toBe('GUEST');
    t.fill({ login: 'other.login' });
    t.submit();

    expect(t.api.create).toHaveBeenCalledTimes(2);
    expect(t.api.create.mock.calls[1]?.[0]).toMatchObject({ login: 'other.login' });
  });

  it.each([
    [400, 'The server rejected the data. Check the form and try again.'],
    [403, 'You are not allowed to do this.'],
    [500, 'Something went wrong. Try again.'],
  ])('shows a message for a %i, and lets the user send again', (status, message) => {
    const t = setUp({ create: () => throwError(() => apiFailure(status)) });
    t.fill(VALID);

    t.submit();

    expect(t.root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(message);
    expect((t.button('Create account') as HTMLButtonElement).disabled).toBe(false);
  });

  it('clears the old message when the next attempt starts', () => {
    const answers = [
      throwError(() => apiFailure(500)),
      new Subject<CreatedUser>(),
    ] as Observable<CreatedUser>[];
    const t = setUp({ create: () => answers.shift() as Observable<CreatedUser> });
    t.fill(VALID);
    t.submit();
    expect(t.root.querySelector('[role="alert"]')).not.toBeNull();

    t.submit();

    expect(t.root.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('UserFormComponent: editing an account', () => {
  const employee = adminUser({
    id: 'u-5',
    login: 'jan.k',
    firstName: 'Jan',
    lastName: 'Kowalski',
    role: 'EMPLOYEE',
  });

  it('is filled with the account, and the login cannot be edited', () => {
    const t = setUp({ user: employee });

    expect(t.text()).toContain('Edit account');
    expect(t.field('user-login')).toBeNull();
    expect(t.field('user-first-name').value).toBe('Jan');
    expect(t.field('user-last-name').value).toBe('Kowalski');
    expect(t.field('user-role').value).toBe('EMPLOYEE');
  });

  it('sends only the field that changed, and never the login', () => {
    const t = setUp({ user: employee });
    t.fill({ firstName: 'Janusz' });

    t.submit();

    expect(t.api.update).toHaveBeenCalledExactlyOnceWith('u-5', { firstName: 'Janusz' });
  });

  it('sends a role change alone', () => {
    const t = setUp({ user: employee });
    t.fill({ role: 'MANAGER' });

    t.submit();

    expect(t.api.update).toHaveBeenCalledExactlyOnceWith('u-5', { role: 'MANAGER' });
  });

  it('sends a name and a role together when both changed, the name trimmed', () => {
    const t = setUp({ user: employee });
    t.fill({ lastName: ' Nowak ', role: 'GUEST' });

    t.submit();

    expect(t.api.update).toHaveBeenCalledExactlyOnceWith('u-5', {
      lastName: 'Nowak',
      role: 'GUEST',
    });
  });

  it('does not count surrounding spaces as a change', () => {
    const t = setUp({ user: employee });
    t.fill({ firstName: '  Jan  ' });

    t.submit();

    expect(t.api.update).not.toHaveBeenCalled();
    expect(t.cancelled).toHaveBeenCalledTimes(1);
  });

  it('closes without a request when nothing changed', () => {
    const t = setUp({ user: employee });

    t.submit();

    expect(t.api.update).not.toHaveBeenCalled();
    expect(t.cancelled).toHaveBeenCalledTimes(1);
    expect(t.saved).not.toHaveBeenCalled();
  });

  it("hands the server's answer back, not what was typed", () => {
    const answer = adminUser({
      id: 'u-5',
      firstName: 'Janusz (server)',
      updatedAt: '2031-01-01T00:00:00.000Z',
    });
    const t = setUp({ user: employee, update: () => of(answer) });
    t.fill({ firstName: 'Janusz' });

    t.submit();

    expect(t.saved).toHaveBeenCalledExactlyOnceWith(answer);
  });

  it('has a Cancel button that closes the editor without a request', () => {
    const t = setUp({ user: employee });
    t.fill({ firstName: 'Janusz' });

    t.button('Cancel')?.click();

    expect(t.cancelled).toHaveBeenCalledTimes(1);
    expect(t.api.update).not.toHaveBeenCalled();
  });

  it('is refilled when it is given another account', () => {
    const t = setUp({ user: employee });

    t.fixture.componentRef.setInput(
      'user',
      adminUser({ id: 'u-6', firstName: 'Ewa', lastName: 'Lis', role: 'GUEST' }),
    );
    t.fixture.detectChanges();

    expect(t.field('user-first-name').value).toBe('Ewa');
    expect(t.field('user-role').value).toBe('GUEST');
  });

  it('shows the refusal (409 protected) as a message and can be tried again', () => {
    const t = setUp({
      user: employee,
      update: () => throwError(() => apiFailure(409, 'PROTECTED_ACCOUNT')),
    });
    t.fill({ role: 'MANAGER' });

    t.submit();

    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain(
      'ADMIN account is protected',
    );
    expect((t.button('Save changes') as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not wrongly report a taken login (that code belongs to creating)', () => {
    const t = setUp({
      user: employee,
      update: () => throwError(() => apiFailure(409, 'LOGIN_ALREADY_EXISTS')),
    });
    t.fill({ firstName: 'Janusz' });

    t.submit();

    expect(t.root.querySelector('[role="alert"]')).toBeNull();
    expect(t.field('user-first-name').getAttribute('aria-invalid')).toBeNull();
  });

  describe('the permanent ADMIN account', () => {
    const admin = adminUser({
      id: 'u-admin',
      login: 'ADMIN',
      firstName: 'System',
      lastName: 'Admin',
      role: 'ADMINISTRATOR',
    });

    it('does not offer a role at all, and says why', () => {
      const t = setUp({ user: admin });

      expect(t.field('user-role')).toBeNull();
      expect(t.text()).toContain('The role of the permanent ADMIN account cannot be changed.');
    });

    it('can still have its name edited, without ever sending a role', () => {
      const t = setUp({ user: admin });
      t.fill({ firstName: 'Root' });

      t.submit();

      expect(t.api.update).toHaveBeenCalledExactlyOnceWith('u-admin', { firstName: 'Root' });
    });

    it('is treated as protected whatever the case or Unicode form of its login', () => {
      const t = setUp({ user: adminUser({ login: 'ａｄｍｉｎ', role: 'ADMINISTRATOR' }) });

      expect(t.field('user-role')).toBeNull();
    });

    it('does not treat a lookalike login as the protected one', () => {
      const t = setUp({ user: adminUser({ login: 'admin2', role: 'MANAGER' }) });

      expect(t.field('user-role')).not.toBeNull();
    });
  });
});
