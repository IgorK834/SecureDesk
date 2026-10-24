// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type {
  MeResponse,
  PasswordChangeResponse,
  PasswordPolicy,
} from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/http/api-client.service';
import { ChangeInitialPasswordComponent } from './change-initial-password.component';

const me = meResponse('EMPLOYEE', 'INITIAL_PASSWORD_CHANGE');
const success: PasswordChangeResponse = {
  user: me.user,
  authStage: 'FULLY_AUTHENTICATED',
};

function failure(status: number, code: string, violations?: string[]): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { error: { code, message: 'server text', details: { violations } } },
  });
}

function setup(
  answer: Observable<PasswordChangeResponse> = of(success),
  policy: PasswordPolicy | null = me.passwordPolicy,
  meAnswer: Observable<MeResponse> = of(me),
) {
  const api = { changeInitialPassword: vi.fn(() => answer) };
  const meCall = vi.fn(() => meAnswer);
  const auth = {
    passwordPolicy: vi.fn(() => policy),
    setSession: vi.fn(),
    clear: vi.fn(),
    load: vi.fn(() => Promise.resolve()),
  };
  const router = {
    navigateByUrl: vi.fn(() => Promise.resolve(true)),
    navigate: vi.fn(() => Promise.resolve(true)),
  };
  TestBed.configureTestingModule({
    imports: [ChangeInitialPasswordComponent],
    providers: [
      { provide: AuthApiService, useValue: api },
      { provide: ApiClient, useValue: { me: meCall } },
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  const fixture = TestBed.createComponent(ChangeInitialPasswordComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = (id: string, value: string) => {
    const element = root.querySelector(`#${id}`) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const fill = (password = 'long private value') => {
    input('new-password', password);
    input('confirm-new-password', password);
  };
  return { api, auth, fill, fixture, input, meCall, root, router };
}

describe('ChangeInitialPasswordComponent', () => {
  it('explains the forced change and renders the public policy hints', () => {
    const { root } = setup();

    expect(root.textContent).toContain('temporary password must be replaced');
    expect(root.textContent).toContain('Use at least 12 characters.');
    expect(root.querySelectorAll('input[autocomplete="new-password"]')).toHaveLength(2);
  });

  it('keeps submit disabled, shows a mismatch, and sends nothing when entries differ', () => {
    const { api, input, root } = setup();
    input('new-password', 'first private value');
    input('confirm-new-password', 'second private value');

    const button = root.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(root.textContent).toContain('Passwords do not match.');
    button.click();
    expect(api.changeInitialPassword).not.toHaveBeenCalled();
  });

  it('renders every allowlisted backend policy violation without profile values', () => {
    const { fill, fixture, root } = setup(
      throwError(() =>
        failure(400, 'PASSWORD_POLICY_VIOLATION', [
          'TOO_SHORT',
          'CONTAINS_FIRST_NAME',
          'CONTAINS_LOGIN',
          'CONTAINS_LAST_NAME',
          'UNKNOWN_FUTURE_RULE',
        ]),
      ),
    );
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Use at least 12 characters.');
    expect(root.textContent).toContain('Do not include your first name in the password.');
    expect(root.textContent).toContain('Do not include your login in the password.');
    expect(root.textContent).toContain('Do not include your last name in the password.');
    expect(root.textContent).toContain('Password does not meet the policy.');
    expect(root.textContent).not.toContain(me.user.firstName);
  });

  it('updates the session, clears both values, and opens the dashboard on success', () => {
    const { auth, fill, fixture, root, router } = setup();
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(auth.setSession).toHaveBeenCalledWith(success);
    expect(fixture.componentInstance.form.getRawValue()).toStrictEqual({
      newPassword: '',
      confirmNewPassword: '',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('clears local auth and explains that an expired temporary password needs an admin reset', () => {
    const { auth, fill, root, router } = setup(
      throwError(() => failure(401, 'AUTH_TEMPORARY_PASSWORD_EXPIRED')),
    );
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'temporary-password-expired' },
    });
  });

  it('keeps a reused-password error on this page', () => {
    const { fill, fixture, root, router } = setup(
      throwError(() => failure(400, 'PASSWORD_REUSED')),
    );
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Choose a password you have not used recently.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('loads policy from /me when login did not include it', () => {
    const updated = {
      ...me,
      passwordPolicy: { minPasswordLength: 20, rejectPersonalDataInPassword: true },
    };
    const { auth, fixture, meCall, root } = setup(of(success), null, of(updated));
    fixture.detectChanges();

    expect(meCall).toHaveBeenCalledOnce();
    expect(auth.setSession).toHaveBeenCalledWith(updated);
    expect(root.textContent).toContain('Use at least 20 characters.');
    expect(root.textContent).toContain('Do not include your login or name.');
  });

  it('returns to login when policy loading finds an expired session', () => {
    const { auth, router } = setup(
      of(success),
      null,
      throwError(() => failure(401, 'AUTH_REQUIRED')),
    );

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('shows a neutral error for an unexpected change failure', () => {
    const { fill, fixture, root } = setup(throwError(() => failure(500, 'INTERNAL_ERROR')));
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Could not change the password. Try again later.');
  });

  it('synchronizes and opens the dashboard when the change already completed', async () => {
    const { auth, fill, root, router } = setup(
      throwError(() => failure(409, 'PASSWORD_CHANGE_ALREADY_COMPLETED')),
    );
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(auth.load).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });
});
