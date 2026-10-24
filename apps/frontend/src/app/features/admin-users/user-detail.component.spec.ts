// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { type Observable, Subject, of, throwError } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUser, apiFailure } from '../../__fixtures__/admin-users';
import { installDialogPolyfill } from '../../__fixtures__/dialog';
import { AuthService } from '../../core/auth/auth.service';
import {
  AdminApi,
  type AdminUser,
  type PasswordReset,
  type UpdateUserRequest,
} from '../../core/http/admin-api.service';
import { UserDetailComponent } from './user-detail.component';

beforeAll(installDialogPolyfill);

@Component({ template: 'users list' })
class ListStub {}

const PROTECTED_TITLE =
  'The permanent ADMIN account is protected: it cannot be blocked or deleted.';
const ALL = ['users:read', 'users:update', 'users:block', 'users:delete'];
const WITH_RESET = [...ALL, 'users:reset-password'];

const SECRET = 'k9#Tq2!vXm7@Lp4w';
const RESET: PasswordReset = {
  temporaryPassword: { value: SECRET, expiresAt: '2030-01-01T12:00:00.000Z' },
};

const ACTIVE = adminUser({ id: 'u-1', login: 'jan.k', firstName: 'Jan', lastName: 'Kowalski' });
const BLOCKED = adminUser({
  id: 'u-2',
  login: 'ewa.l',
  firstName: 'Ewa',
  lastName: 'Lis',
  isBlocked: true,
});
const ADMIN = adminUser({
  id: 'u-admin',
  login: 'ADMIN',
  firstName: 'System',
  lastName: 'Admin',
  role: 'ADMINISTRATOR',
});

interface Overrides {
  granted?: string[];
  get?: (id: string) => Observable<AdminUser>;
  block?: (id: string) => Observable<AdminUser>;
  unblock?: (id: string) => Observable<AdminUser>;
  delete?: (id: string) => Observable<void>;
  resetPassword?: (id: string) => Observable<PasswordReset>;
  update?: (id: string, changes: UpdateUserRequest) => Observable<AdminUser>;
}

async function open(url: string, overrides: Overrides = {}) {
  const { granted = ALL } = overrides;
  const api = {
    get: vi.fn(overrides.get ?? ((id: string) => of(adminUser({ ...ACTIVE, id })))),
    block: vi.fn(overrides.block ?? ((id: string) => of(adminUser({ id, isBlocked: true })))),
    unblock: vi.fn(overrides.unblock ?? ((id: string) => of(adminUser({ id, isBlocked: false })))),
    delete: vi.fn(overrides.delete ?? (() => of(undefined as void))),
    resetPassword: vi.fn(overrides.resetPassword ?? ((): Observable<PasswordReset> => of(RESET))),
    update: vi.fn(
      overrides.update ??
        ((id: string, changes: UpdateUserRequest) => of(adminUser({ ...ACTIVE, id, ...changes }))),
    ),
  };
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'admin/users/:id', component: UserDetailComponent },
        { path: 'admin/users', component: ListStub },
      ]),
      { provide: AdminApi, useValue: api },
      { provide: AuthService, useValue: { has: (p: string) => granted.includes(p) } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, UserDetailComponent);
  harness.detectChanges();
  const root = harness.routeNativeElement as HTMLElement;

  const t = {
    api,
    harness,
    root,
    router: TestBed.inject(Router),
    text: () => root.textContent ?? '',
    button: (label: string) =>
      [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) as
        HTMLButtonElement | undefined,
    confirmDialog: () =>
      root.querySelector('dialog[aria-labelledby="confirm-dialog-title"]') as HTMLDialogElement,
    revealDialog: () =>
      root.querySelector('dialog[aria-labelledby="temp-password-title"]') as HTMLDialogElement,
    // Lets the promise chains that follow a click run, then renders their result.
    async settle() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.detectChanges();
    },
    /** Presses an action button and answers the confirmation question that opens. */
    async act(label: string, answer: 'confirm' | 'cancel') {
      t.button(label)?.click();
      await t.settle();
      const buttons = [...t.confirmDialog().querySelectorAll('button')];
      buttons
        .find((b) =>
          answer === 'cancel' ? b.textContent?.trim() === 'Cancel' : b.className === 'confirm',
        )
        ?.click();
      await t.settle();
    },
  };
  return t;
}

describe('UserDetailComponent: showing the account', () => {
  it('loads the account named in the URL, and nothing else', async () => {
    const t = await open('/admin/users/u-1');

    expect(t.api.get).toHaveBeenCalledExactlyOnceWith('u-1');
  });

  it('shows name, login, role, status and dates', async () => {
    const t = await open('/admin/users/u-1');

    expect(t.root.querySelector('h1')?.textContent).toBe('Jan Kowalski');
    expect(t.text()).toContain('jan.k');
    expect(t.text()).toContain('Employee');
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
    expect(t.text()).toContain('Created');
    expect(t.text()).toContain('Last changed');
    expect(t.text()).toContain('Password changed');
  });

  it('shows the temporary password deadline only while the account has one', async () => {
    const pending = adminUser({
      mustChangePassword: true,
      temporaryPasswordExpiresAt: '2030-01-02T00:00:00.000Z',
      passwordChangedAt: null,
    });
    const withTemp = await open('/admin/users/u-1', { get: () => of(pending) });

    expect(withTemp.text()).toContain('Temporary password valid until');
    expect(withTemp.text()).not.toContain('Password changed');
    expect(withTemp.root.querySelector('app-user-status-badge')?.textContent).toContain(
      'Pending first login',
    );
  });

  it('shows a blocked account as blocked', async () => {
    const t = await open('/admin/users/u-2', { get: () => of(BLOCKED) });

    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Blocked');
  });

  it('shows markup in a name as text', async () => {
    const hostile = adminUser({ firstName: '<img src=x onerror=alert(1)>', lastName: 'X' });
    const t = await open('/admin/users/u-1', { get: () => of(hostile) });

    expect(t.root.querySelector('h1')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(t.root.querySelector('img')).toBeNull();
  });

  it('says "loading" until the answer arrives', async () => {
    const t = await open('/admin/users/u-1', { get: () => new Subject<AdminUser>() });

    expect(t.text()).toContain('Loading the account');
    expect(t.root.querySelector('h1')).toBeNull();
  });

  it('loads the other account when the id in the URL changes, and drops the late answer of the first', async () => {
    const first = new Subject<AdminUser>();
    const second = new Subject<AdminUser>();
    const answers: Record<string, Subject<AdminUser>> = { 'u-1': first, 'u-2': second };
    const t = await open('/admin/users/u-1', { get: (id) => answers[id] as Subject<AdminUser> });

    await t.harness.navigateByUrl('/admin/users/u-2', UserDetailComponent);
    second.next(BLOCKED);
    t.harness.detectChanges();
    first.next(ACTIVE); // arrives late
    t.harness.detectChanges();

    expect(t.api.get).toHaveBeenCalledTimes(2);
    expect(t.root.querySelector('h1')?.textContent).toBe('Ewa Lis');
  });
});

describe('UserDetailComponent: when the account cannot be shown', () => {
  it('shows the not-found page for an unknown or deleted account (404)', async () => {
    const t = await open('/admin/users/zzz', { get: () => throwError(() => apiFailure(404)) });

    expect(t.root.querySelector('app-not-found')).not.toBeNull();
    expect(t.root.querySelector('h1')?.textContent).toBe('Page not found');
  });

  it('shows the access-denied page for someone not allowed to see it (403)', async () => {
    const t = await open('/admin/users/u-1', { get: () => throwError(() => apiFailure(403)) });

    expect(t.root.querySelector('app-forbidden')).not.toBeNull();
  });

  it('asks a signed-out visitor to sign in again (401)', async () => {
    const t = await open('/admin/users/u-1', { get: () => throwError(() => apiFailure(401)) });

    expect(t.text()).toContain('Your session has ended');
    expect(t.root.querySelector('a[href="/login"]')).not.toBeNull();
  });

  it('says it could not load, and links back to the list, after any other failure', async () => {
    const t = await open('/admin/users/u-1', { get: () => throwError(() => apiFailure(500)) });

    expect(t.text()).toContain('Could not load the account');
    expect(t.root.querySelector('a[href="/admin/users"]')).not.toBeNull();
  });

  it('handles a failure with no answer at all (network down)', async () => {
    const t = await open('/admin/users/u-1', { get: () => throwError(() => new Error('offline')) });

    expect(t.text()).toContain('Could not load the account');
  });

  it('shows no action buttons for an account it could not load', async () => {
    const t = await open('/admin/users/u-1', { get: () => throwError(() => apiFailure(404)) });

    expect(t.root.querySelectorAll('.actions button')).toHaveLength(0);
  });
});

describe('UserDetailComponent: which buttons are offered', () => {
  it('offers Edit, Block and Delete to someone who holds all three permissions', async () => {
    const t = await open('/admin/users/u-1');

    expect(t.button('Edit')).toBeDefined();
    expect(t.button('Block')).toBeDefined();
    expect(t.button('Delete')).toBeDefined();
    expect(t.button('Unblock')).toBeUndefined();
  });

  it('offers none of them to someone who may only read', async () => {
    const t = await open('/admin/users/u-1', { granted: ['users:read'] });

    expect(t.root.querySelectorAll('.actions button')).toHaveLength(0);
  });

  it.each([
    ['users:update', 'Edit'],
    ['users:reset-password', 'Reset password'],
    ['users:block', 'Block'],
    ['users:delete', 'Delete'],
  ])('offers %s as "%s" and nothing else', async (permission, label) => {
    const t = await open('/admin/users/u-1', { granted: ['users:read', permission] });

    const shown = [...t.root.querySelectorAll('.actions button')].map((b) => b.textContent?.trim());

    expect(shown).toStrictEqual([label]);
  });

  it('offers Unblock instead of Block for a blocked account', async () => {
    const t = await open('/admin/users/u-2', { get: () => of(BLOCKED) });

    expect(t.button('Unblock')).toBeDefined();
    expect(t.button('Block')).toBeUndefined();
  });
});

describe('UserDetailComponent: blocking', () => {
  it('asks first, in words that say what will happen, and calls nothing yet', async () => {
    const t = await open('/admin/users/u-1');

    t.button('Block')?.click();
    await t.settle();

    expect(t.confirmDialog().hasAttribute('open')).toBe(true);
    expect(t.confirmDialog().textContent).toContain('Block this account?');
    expect(t.confirmDialog().textContent).toContain('signed out of every session at once');
    expect(t.confirmDialog().textContent).toContain('jan.k');
    expect(t.api.block).not.toHaveBeenCalled();
  });

  it('does nothing when the administrator cancels', async () => {
    const t = await open('/admin/users/u-1');

    await t.act('Block', 'cancel');

    expect(t.api.block).not.toHaveBeenCalled();
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
    expect(t.confirmDialog().hasAttribute('open')).toBe(false);
  });

  it('blocks the account when confirmed, and shows the new state', async () => {
    const t = await open('/admin/users/u-1');

    await t.act('Block', 'confirm');

    expect(t.api.block).toHaveBeenCalledExactlyOnceWith('u-1');
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Blocked');
    expect(t.button('Unblock')).toBeDefined();
    expect(t.button('Block')).toBeUndefined();
    expect(t.text()).toContain('Account blocked. Its sessions were ended.');
  });

  it("shows the server's refusal and keeps the account as it was", async () => {
    const t = await open('/admin/users/u-1', { block: () => throwError(() => apiFailure(404)) });

    await t.act('Block', 'confirm');

    expect(t.root.querySelector('[role="alert"]')?.textContent).toBe(
      'This account no longer exists.',
    );
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
    expect(t.button('Block')?.disabled).toBe(false);
  });

  it('allows only one action at a time while one is in flight', async () => {
    const t = await open('/admin/users/u-1', { block: () => new Subject<AdminUser>() });

    await t.act('Block', 'confirm');

    expect(t.button('Block')?.disabled).toBe(true);
    expect(t.button('Delete')?.disabled).toBe(true);
    expect(t.button('Edit')?.disabled).toBe(true);
  });
});

describe('UserDetailComponent: unblocking', () => {
  it('asks first and says what it does, and what it does not', async () => {
    const t = await open('/admin/users/u-2', { get: () => of(BLOCKED) });

    t.button('Unblock')?.click();
    await t.settle();

    expect(t.confirmDialog().textContent).toContain('Unblock this account?');
    expect(t.confirmDialog().textContent).toContain('sign in again with their current password');
    expect(t.confirmDialog().textContent).toContain('stay ended');
    expect(t.api.unblock).not.toHaveBeenCalled();
  });

  it('does nothing when cancelled', async () => {
    const t = await open('/admin/users/u-2', { get: () => of(BLOCKED) });

    await t.act('Unblock', 'cancel');

    expect(t.api.unblock).not.toHaveBeenCalled();
    expect(t.button('Unblock')).toBeDefined();
  });

  it('unblocks when confirmed and shows the new state', async () => {
    const t = await open('/admin/users/u-2', { get: () => of(BLOCKED) });

    await t.act('Unblock', 'confirm');

    expect(t.api.unblock).toHaveBeenCalledExactlyOnceWith('u-2');
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
    expect(t.button('Block')).toBeDefined();
    expect(t.text()).toContain('Account unblocked.');
  });

  it('shows the refusal when it fails', async () => {
    const t = await open('/admin/users/u-2', {
      get: () => of(BLOCKED),
      unblock: () => throwError(() => apiFailure(500)),
    });

    await t.act('Unblock', 'confirm');

    expect(t.root.querySelector('[role="alert"]')?.textContent).toBe(
      'Something went wrong. Try again.',
    );
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Blocked');
  });
});

describe('UserDetailComponent: resetting a password', () => {
  afterEach(() => vi.restoreAllMocks());

  const saved = (t: Awaited<ReturnType<typeof open>>) =>
    [...t.revealDialog().querySelectorAll('button')]
      .find((b) => b.textContent?.includes('I have saved the password'))
      ?.click();

  it('is not offered to someone without the permission', async () => {
    const t = await open('/admin/users/u-1');

    expect(t.button('Reset password')).toBeUndefined();
  });

  it('is offered to someone who holds it', async () => {
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    expect(t.button('Reset password')?.disabled).toBe(false);
  });

  it('asks first, in words that say what will happen, and calls nothing yet', async () => {
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    t.button('Reset password')?.click();
    await t.settle();

    const text = t.confirmDialog().textContent ?? '';
    expect(t.confirmDialog().hasAttribute('open')).toBe(true);
    expect(text).toContain('Reset this password?');
    expect(text).toContain('jan.k');
    expect(text).toContain('signed out of every session at once');
    expect(text).toContain('current password will stop working');
    expect(text).toContain('valid for 12 hours');
    expect(text).toContain('replace at their next sign-in');
    expect(text).not.toContain('stays blocked');
    expect(text).not.toContain('permanent ADMIN');
    expect(t.api.resetPassword).not.toHaveBeenCalled();
    expect(t.revealDialog().hasAttribute('open')).toBe(false);
  });

  it('does nothing when the administrator cancels', async () => {
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    await t.act('Reset password', 'cancel');

    expect(t.api.resetPassword).not.toHaveBeenCalled();
    expect(t.revealDialog().hasAttribute('open')).toBe(false);
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
  });

  it('resets the account when confirmed, and shows the new password once, to say who it is for', async () => {
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    await t.act('Reset password', 'confirm');

    expect(t.api.resetPassword).toHaveBeenCalledExactlyOnceWith('u-1');
    expect(t.revealDialog().hasAttribute('open')).toBe(true);
    expect(
      t.revealDialog().querySelector<HTMLInputElement>('#temporary-password-value')?.value,
    ).toBe(SECRET);
    expect(t.revealDialog().textContent).toContain('The password of jan.k has been reset');
    expect(t.revealDialog().textContent).toContain('only once');
  });

  it('shows the account as owing a new password, with the deadline of the one just issued', async () => {
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    await t.act('Reset password', 'confirm');

    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain(
      'Pending first login',
    );
    expect(t.text()).toContain('Temporary password valid until');
    expect(t.text()).toContain('Password reset. Its sessions were ended.');
  });

  it('keeps the password in the one-time dialog only, and removes it when that is closed', async () => {
    const consoleCalls = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const t = await open('/admin/users/u-1', { granted: WITH_RESET });

    await t.act('Reset password', 'confirm');

    expect(
      t.revealDialog().querySelector<HTMLInputElement>('#temporary-password-value')?.value,
    ).toBe(SECRET);
    expect(t.router.url).not.toContain(SECRET);
    expect(JSON.stringify(history.state)).not.toContain(SECRET);
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain(SECRET);

    saved(t);
    await t.settle();

    expect(t.root.innerHTML).not.toContain(SECRET);
    expect(t.revealDialog().hasAttribute('open')).toBe(false);
    expect(consoleCalls.flatMap((spy) => spy.mock.calls.flat()).join(' ')).not.toContain(SECRET);
  });

  it('does not offer the password again: asking for a second reset gives a new one, not the old', async () => {
    const second = {
      temporaryPassword: {
        value: 'Z7!pLm2#qW9xRt4v',
        expiresAt: RESET.temporaryPassword.expiresAt,
      },
    };
    const answers = [RESET, second];
    const t = await open('/admin/users/u-1', {
      granted: WITH_RESET,
      resetPassword: () => of(answers.shift() as PasswordReset),
    });
    await t.act('Reset password', 'confirm');
    saved(t);
    await t.settle();

    await t.act('Reset password', 'confirm');

    expect(
      t.revealDialog().querySelector<HTMLInputElement>('#temporary-password-value')?.value,
    ).toBe('Z7!pLm2#qW9xRt4v');
    expect(t.root.innerHTML).not.toContain(SECRET);
  });

  it.each([
    [404, 'This account no longer exists.'],
    [403, 'You are not allowed to do this.'],
    [401, 'Your session has ended. Sign in again.'],
    [500, 'Something went wrong. Try again.'],
  ])(
    'shows the refusal for a %i, opens no password dialog and leaves the account as it was',
    async (status, message) => {
      const t = await open('/admin/users/u-1', {
        granted: WITH_RESET,
        resetPassword: () => throwError(() => apiFailure(status)),
      });

      await t.act('Reset password', 'confirm');

      expect(t.root.querySelector('[role="alert"]')?.textContent).toBe(message);
      expect(t.revealDialog().hasAttribute('open')).toBe(false);
      expect(t.root.querySelector('#temporary-password-value')).toBeNull();
      expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Active');
      expect(t.button('Reset password')?.disabled).toBe(false);
    },
  );

  it('allows only one action at a time while the reset is in flight', async () => {
    const t = await open('/admin/users/u-1', {
      granted: [...WITH_RESET],
      resetPassword: () => new Subject<PasswordReset>(),
    });

    await t.act('Reset password', 'confirm');

    for (const label of ['Reset password', 'Edit', 'Block', 'Delete']) {
      expect(t.button(label)?.disabled, label).toBe(true);
    }
    expect(t.revealDialog().hasAttribute('open')).toBe(false);
  });

  it('says that a blocked account stays blocked, and it does', async () => {
    const t = await open('/admin/users/u-2', { granted: WITH_RESET, get: () => of(BLOCKED) });

    t.button('Reset password')?.click();
    await t.settle();
    expect(t.confirmDialog().textContent).toContain('stays blocked until you unblock it');
    [...t.confirmDialog().querySelectorAll('button')]
      .find((b) => b.className === 'confirm')
      ?.click();
    await t.settle();

    expect(t.api.resetPassword).toHaveBeenCalledExactlyOnceWith('u-2');
    expect(t.root.querySelector('app-user-status-badge')?.textContent).toContain('Blocked');
    expect(t.button('Unblock')).toBeDefined();
  });

  it('can be started for the permanent ADMIN account, with a warning that nobody else can reset it', async () => {
    const t = await open('/admin/users/u-admin', { granted: WITH_RESET, get: () => of(ADMIN) });
    expect(t.button('Reset password')?.disabled).toBe(false);
    expect(t.button('Reset password')?.hasAttribute('title')).toBe(false);

    t.button('Reset password')?.click();
    await t.settle();
    expect(t.confirmDialog().textContent).toContain('no other account can reset it');
    [...t.confirmDialog().querySelectorAll('button')]
      .find((b) => b.className === 'confirm')
      ?.click();
    await t.settle();

    expect(t.api.resetPassword).toHaveBeenCalledExactlyOnceWith('u-admin');
    expect(
      t.revealDialog().querySelector<HTMLInputElement>('#temporary-password-value')?.value,
    ).toBe(SECRET);
  });
});

describe('UserDetailComponent: deleting', () => {
  it('asks first and states every consequence, including that it cannot be undone', async () => {
    const t = await open('/admin/users/u-1');

    t.button('Delete')?.click();
    await t.settle();

    const text = t.confirmDialog().textContent ?? '';
    expect(text).toContain('Delete this account?');
    expect(text).toContain('signed out at once');
    expect(text).toContain('never be able to sign in again');
    expect(text).toContain('login stays reserved');
    expect(text).toContain('tickets are kept');
    expect(text).toContain('cannot undo');
    expect(t.api.delete).not.toHaveBeenCalled();
  });

  it('does nothing when cancelled, and stays on the account', async () => {
    const t = await open('/admin/users/u-1');

    await t.act('Delete', 'cancel');

    expect(t.api.delete).not.toHaveBeenCalled();
    expect(t.router.url).toBe('/admin/users/u-1');
  });

  it('deletes when confirmed and returns to the list', async () => {
    const t = await open('/admin/users/u-1');

    await t.act('Delete', 'confirm');

    expect(t.api.delete).toHaveBeenCalledExactlyOnceWith('u-1');
    expect(t.router.url).toBe('/admin/users');
  });

  it('stays on the account and says why when the server refuses (409 protected)', async () => {
    const t = await open('/admin/users/u-1', {
      delete: () => throwError(() => apiFailure(409, 'PROTECTED_ACCOUNT')),
    });

    await t.act('Delete', 'confirm');

    expect(t.router.url).toBe('/admin/users/u-1');
    expect(t.root.querySelector('[role="alert"]')?.textContent).toContain(
      'ADMIN account is protected',
    );
    expect(t.button('Delete')?.disabled).toBe(false);
  });
});

describe('UserDetailComponent: the permanent ADMIN account', () => {
  it('has Block and Delete disabled, each with the reason as a tooltip', async () => {
    const t = await open('/admin/users/u-admin', { get: () => of(ADMIN) });

    for (const label of ['Block', 'Delete']) {
      expect(t.button(label)?.disabled).toBe(true);
      expect(t.button(label)?.getAttribute('title')).toBe(PROTECTED_TITLE);
    }
  });

  it('also says it in the page, because a tooltip alone does not reach everyone', async () => {
    const t = await open('/admin/users/u-admin', { get: () => of(ADMIN) });

    expect(t.root.querySelector('.actions + p')?.textContent).toBe(PROTECTED_TITLE);
  });

  it('cannot start the confirmation, so no request can follow', async () => {
    const t = await open('/admin/users/u-admin', { get: () => of(ADMIN) });

    t.button('Block')?.click();
    t.button('Delete')?.click();
    await t.settle();

    expect(t.confirmDialog().hasAttribute('open')).toBe(false);
    expect(t.api.block).not.toHaveBeenCalled();
    expect(t.api.delete).not.toHaveBeenCalled();
  });

  it('can still be edited', async () => {
    const t = await open('/admin/users/u-admin', { get: () => of(ADMIN) });

    expect(t.button('Edit')?.disabled).toBe(false);
  });

  it('shows no tooltip, and no note, for an ordinary account', async () => {
    const t = await open('/admin/users/u-1');

    expect(t.button('Block')?.hasAttribute('title')).toBe(false);
    expect(t.button('Delete')?.hasAttribute('title')).toBe(false);
    expect(t.text()).not.toContain('permanent ADMIN account');
  });
});

describe('UserDetailComponent: editing', () => {
  it('opens the form filled with the account', async () => {
    const t = await open('/admin/users/u-1');

    t.button('Edit')?.click();
    t.harness.detectChanges();

    expect(t.root.querySelector('app-user-form')).not.toBeNull();
    expect((t.root.querySelector('#user-first-name') as HTMLInputElement).value).toBe('Jan');
    expect(t.root.querySelector('#user-login')).toBeNull();
    expect(t.root.querySelector('dl')).toBeNull();
  });

  it("saves a change, shows the server's answer, closes the form and says it saved", async () => {
    const t = await open('/admin/users/u-1');
    t.button('Edit')?.click();
    t.harness.detectChanges();
    const first = t.root.querySelector('#user-first-name') as HTMLInputElement;
    first.value = 'Janusz';
    first.dispatchEvent(new Event('input'));

    (t.root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await t.settle();

    expect(t.api.update).toHaveBeenCalledExactlyOnceWith('u-1', { firstName: 'Janusz' });
    expect(t.root.querySelector('app-user-form')).toBeNull();
    expect(t.root.querySelector('h1')?.textContent).toBe('Janusz Kowalski');
    expect(t.text()).toContain('Changes saved.');
  });

  it('returns to the account, unchanged, when the editor is cancelled', async () => {
    const t = await open('/admin/users/u-1');
    t.button('Edit')?.click();
    t.harness.detectChanges();

    (t.root.querySelector('app-user-form button[type="button"]') as HTMLButtonElement).click();
    t.harness.detectChanges();

    expect(t.root.querySelector('app-user-form')).toBeNull();
    expect(t.root.querySelector('h1')?.textContent).toBe('Jan Kowalski');
    expect(t.api.update).not.toHaveBeenCalled();
  });

  it('forgets an old message when editing starts', async () => {
    const t = await open('/admin/users/u-1');
    await t.act('Block', 'confirm');
    expect(t.text()).toContain('Account blocked.');

    t.button('Edit')?.click();
    t.harness.detectChanges();

    expect(t.text()).not.toContain('Account blocked.');
  });

  it('forgets an open editor when another account is opened', async () => {
    const t = await open('/admin/users/u-1');
    t.button('Edit')?.click();
    t.harness.detectChanges();

    await t.harness.navigateByUrl('/admin/users/u-2', UserDetailComponent);
    t.harness.detectChanges();

    expect(t.root.querySelector('app-user-form')).toBeNull();
    expect(t.api.get).toHaveBeenLastCalledWith('u-2');
  });
});
