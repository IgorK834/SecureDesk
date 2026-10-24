// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type { AuthStage, LoginResponse } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { LoginComponent } from './login.component';

const response = (stage: AuthStage = 'FULLY_AUTHENTICATED'): LoginResponse => {
  const me = meResponse('EMPLOYEE', stage);
  return { user: me.user, authStage: stage, mustChangePassword: me.mustChangePassword };
};

function failure(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { error: { code, message: 'server text is not rendered' } },
  });
}

function setup(
  answer: Observable<LoginResponse> = of(response()),
  query: Record<string, string> = {},
) {
  const api = { login: vi.fn(() => answer) };
  const auth = { setSession: vi.fn(), load: vi.fn(() => Promise.resolve()) };
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    imports: [LoginComponent],
    providers: [
      { provide: AuthApiService, useValue: api },
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoginComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = (id: string, value: string) => {
    const element = root.querySelector(`#${id}`) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const valid = () => {
    input('login', ' employee1 ');
    input('password', 'private value');
    fixture.detectChanges();
  };
  return { api, auth, fixture, input, root, router, valid };
}

describe('LoginComponent', () => {
  it('renders a masked password field with the required autocomplete values', () => {
    const { root } = setup();

    expect(root.querySelector<HTMLInputElement>('#login')?.autocomplete).toBe('username');
    expect(root.querySelector<HTMLInputElement>('#password')?.type).toBe('password');
    expect(root.querySelector<HTMLInputElement>('#password')?.autocomplete).toBe(
      'current-password',
    );
  });

  it.each(['login', 'password'])('submits when Enter is pressed in the %s field', (id) => {
    const pending = new Subject<LoginResponse>();
    const { api, root, valid } = setup(pending);
    valid();

    root
      .querySelector(`#${id}`)
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(api.login).toHaveBeenCalledTimes(1);
    expect(api.login).toHaveBeenCalledWith({ login: 'employee1', password: 'private value' });
  });

  it.each(['wrong password', 'unknown login'])(
    'shows the same exact 401 message for %s and clears only the password',
    () => {
      const { fixture, input, root } = setup(
        throwError(() => failure(401, 'AUTH_INVALID_CREDENTIALS')),
      );
      input('login', 'employee1');
      input('password', 'private value');

      (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(root.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        'Login lub hasło niepoprawne',
      );
      expect((root.querySelector('#login') as HTMLInputElement).value).toBe('employee1');
      expect((root.querySelector('#password') as HTMLInputElement).value).toBe('');
    },
  );

  it('shows a neutral rate-limit message and clears the password', () => {
    const { fixture, root, valid } = setup(throwError(() => failure(429, 'AUTH_RATE_LIMITED')));
    valid();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Too many attempts, try again later',
    );
    expect((root.querySelector('#password') as HTMLInputElement).value).toBe('');
  });

  it('shows a neutral availability message for a non-authentication failure', () => {
    const { fixture, root, valid } = setup(throwError(() => failure(500, 'INTERNAL_ERROR')));
    valid();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Sign in is unavailable. Try again later.',
    );
  });

  it('reports a login over the 64-character limit without sending it', () => {
    const { api, fixture, input, root } = setup();
    input('login', 'x'.repeat(65));
    input('password', 'private value');

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Use at most 64 characters.');
    expect(api.login).not.toHaveBeenCalled();
  });

  it('disables submit while pending so rapid clicks make one request', () => {
    const pending = new Subject<LoginResponse>();
    const { api, fixture, root, valid } = setup(pending);
    valid();
    const button = root.querySelector('button[type="submit"]') as HTMLButtonElement;

    button.click();
    fixture.detectChanges();
    button.click();

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Signing in');
    expect(api.login).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['INITIAL_PASSWORD_CHANGE', '/change-initial-password'],
    ['PASSWORD_EXPIRED', '/account/change-password'],
    ['FULLY_AUTHENTICATED', '/dashboard'],
  ] as const)('stores a %s session and navigates to %s', async (stage, destination) => {
    const { auth, router, root, valid } = setup(of(response(stage)));
    valid();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(auth.setSession).toHaveBeenCalledWith(response(stage));
    expect(router.navigateByUrl).toHaveBeenCalledWith(destination);
  });

  it('refreshes server-granted permissions after a fully authenticated login', () => {
    const { auth, root, valid } = setup(of(response()));
    valid();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(auth.load).toHaveBeenCalledOnce();
  });

  it('uses a safe returnUrl but ignores a scheme-relative one', async () => {
    const safe = setup(of(response()), { returnUrl: '/tickets?mine=true' });
    safe.valid();
    (safe.root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(safe.router.navigateByUrl).toHaveBeenCalledWith('/tickets?mine=true');

    TestBed.resetTestingModule();
    const unsafe = setup(of(response()), { returnUrl: '//evil.example' });
    unsafe.valid();
    (unsafe.root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await Promise.resolve();
    expect(unsafe.router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('shows a neutral session-expired banner', () => {
    const { root } = setup(of(response()), { reason: 'session-expired' });

    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      'Your session has expired due to inactivity.',
    );
  });

  it('explains the administrator reset needed for an expired temporary password', () => {
    const { root } = setup(of(response()), { reason: 'temporary-password-expired' });

    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      'Ask an administrator to reset it.',
    );
  });
});
