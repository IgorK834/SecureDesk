// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meResponse, unauthorized } from '../../__fixtures__/session';
import { ApiClient } from '../http/api-client.service';
import { AuthService } from './auth.service';
import type { MeResponse } from './auth.models';

function createAuth(me: ReturnType<typeof vi.fn>): AuthService {
  TestBed.configureTestingModule({ providers: [{ provide: ApiClient, useValue: { me } }] });
  return TestBed.inject(AuthService);
}

const signedInAs = (me: MeResponse) => createAuth(vi.fn(() => of(me)));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AuthService.load()', () => {
  it('starts as nobody, not yet loaded', () => {
    const auth = signedInAs(meResponse('GUEST'));

    expect(auth.user()).toBeNull();
    expect(auth.authStage()).toBeNull();
    expect(auth.permissions()).toStrictEqual([]);
    expect(auth.passwordPolicy()).toBeNull();
    expect(auth.totpEnabled()).toBe(false);
    expect(auth.loaded()).toBe(false);
  });

  it('rebuilds the user, stage and permissions from the server (what a reload relies on)', async () => {
    const me = meResponse('EMPLOYEE');
    const auth = signedInAs(me);

    await auth.load();

    expect(auth.user()).toStrictEqual(me.user);
    expect(auth.authStage()).toBe('FULLY_AUTHENTICATED');
    expect(auth.permissions()).toStrictEqual(me.permissions);
    expect(auth.passwordPolicy()).toStrictEqual(me.passwordPolicy);
    expect(auth.totpEnabled()).toBe(false);
    expect(auth.loaded()).toBe(true);
  });

  it('treats a 401 as "nobody is signed in": no error, nothing logged', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const auth = createAuth(vi.fn(() => throwError(unauthorized)));

    await expect(auth.load()).resolves.toBeUndefined();

    expect(auth.user()).toBeNull();
    expect(auth.loaded()).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ['a 500 from the server', new HttpErrorResponse({ status: 500, url: '/api/auth/me' })],
    ['a network failure', new TypeError('Failed to fetch')],
  ])(
    'fails closed but loudly on %s: signed out, and the problem is logged',
    async (_name, failure) => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const auth = createAuth(vi.fn(() => throwError(() => failure)));

      // Must not reject: a rejected app initializer would stop the whole app from starting.
      await expect(auth.load()).resolves.toBeUndefined();

      expect(auth.user()).toBeNull();
      expect(auth.loaded()).toBe(true);
      expect(consoleError).toHaveBeenCalledTimes(1);
    },
  );

  it('drops a previous session when the server no longer recognises the cookie', async () => {
    const me = vi
      .fn()
      .mockReturnValueOnce(of(meResponse('MANAGER')))
      .mockReturnValue(throwError(unauthorized));
    const auth = createAuth(me);
    await auth.load();
    expect(auth.user()).not.toBeNull();

    await auth.load();

    expect(auth.user()).toBeNull();
    expect(auth.authStage()).toBeNull();
    expect(auth.permissions()).toStrictEqual([]);
  });

  it('never writes the session to browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    await signedInAs(meResponse('ADMINISTRATOR')).load();

    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  it('does not restore a stale in-flight session after auth was cleared', async () => {
    const answer = new Subject<MeResponse>();
    const auth = createAuth(vi.fn(() => answer));
    auth.setSession(meResponse('MANAGER'));

    const loading = auth.load();
    auth.clear();
    answer.next(meResponse('MANAGER'));
    answer.complete();
    await loading;

    expect(auth.user()).toBeNull();
    expect(auth.permissions()).toStrictEqual([]);
  });
});

describe('AuthService.has()', () => {
  it('is true only for permissions the server granted', async () => {
    const auth = signedInAs(meResponse('GUEST'));
    await auth.load();

    expect(auth.has('tickets:create')).toBe(true);
    expect(auth.has('users:read')).toBe(false);
  });

  it('accepts a list and is true when any one is held (like the backend)', async () => {
    const auth = signedInAs(meResponse('GUEST'));
    await auth.load();

    expect(auth.has(['users:read', 'tickets:read:own'])).toBe(true);
    expect(auth.has(['users:read', 'users:create'])).toBe(false);
  });

  it('denies an empty list: nothing required is not the same as everything allowed', async () => {
    const auth = signedInAs(meResponse('ADMINISTRATOR'));
    await auth.load();

    expect(auth.has([])).toBe(false);
  });

  it('denies everything to nobody', () => {
    const auth = signedInAs(meResponse('ADMINISTRATOR'));

    expect(auth.has('users:read')).toBe(false);
  });

  it.each(['INITIAL_PASSWORD_CHANGE', 'PASSWORD_EXPIRED'] as const)(
    'grants nothing while the session is still in stage %s, even to a role that holds it',
    async (stage) => {
      const auth = signedInAs(meResponse('ADMINISTRATOR', stage));
      await auth.load();

      expect(auth.permissions()).toContain('users:read');
      expect(auth.has('users:read')).toBe(false);
    },
  );
});

describe('AuthService.clear()', () => {
  it('forgets the session in this tab', async () => {
    const auth = signedInAs(meResponse('EMPLOYEE'));
    await auth.load();

    auth.clear();

    expect(auth.user()).toBeNull();
    expect(auth.authStage()).toBeNull();
    expect(auth.passwordPolicy()).toBeNull();
    expect(auth.has('tickets:create')).toBe(false);
  });
});

describe('AuthService.setSession()', () => {
  it('preserves /me-only permissions and policy across a password rotation for the same user', async () => {
    const me = meResponse('EMPLOYEE', 'INITIAL_PASSWORD_CHANGE');
    const auth = signedInAs(me);
    await auth.load();

    auth.setSession({ user: me.user, authStage: 'FULLY_AUTHENTICATED' });

    expect(auth.permissions()).toStrictEqual(me.permissions);
    expect(auth.passwordPolicy()).toStrictEqual(me.passwordPolicy);
  });

  it('does not carry session data across users when a login response has no permissions', async () => {
    const previous = meResponse('ADMINISTRATOR');
    const next = meResponse('GUEST');
    const auth = signedInAs(previous);
    await auth.load();

    auth.setSession({ user: next.user, authStage: next.authStage });

    expect(auth.user()).toStrictEqual(next.user);
    expect(auth.permissions()).toStrictEqual([]);
    expect(auth.passwordPolicy()).toBeNull();
  });

  it('updates the local TOTP status without storing any secret', async () => {
    const auth = signedInAs(meResponse('EMPLOYEE'));
    await auth.load();

    auth.setTotpEnabled(true);
    expect(auth.totpEnabled()).toBe(true);
    auth.setTotpEnabled(false);
    expect(auth.totpEnabled()).toBe(false);
  });
});
