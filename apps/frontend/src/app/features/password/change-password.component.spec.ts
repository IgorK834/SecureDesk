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
  AuthStage,
  MeResponse,
  PasswordChangeResponse,
  PasswordPolicy,
} from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { ApiClient } from '../../core/http/api-client.service';
import { ChangePasswordComponent } from './change-password.component';

const fullMe = meResponse('MANAGER');
const success: PasswordChangeResponse = {
  user: fullMe.user,
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
  stage: AuthStage = 'FULLY_AUTHENTICATED',
  policy: PasswordPolicy | null = fullMe.passwordPolicy,
  meAnswer: Observable<MeResponse> = of(fullMe),
) {
  const api = { changePassword: vi.fn(() => answer) };
  const meCall = vi.fn(() => meAnswer);
  const auth = {
    passwordPolicy: vi.fn(() => policy),
    authStage: vi.fn(() => stage),
    setSession: vi.fn(),
    clear: vi.fn(),
  };
  const router = {
    navigateByUrl: vi.fn(() => Promise.resolve(true)),
    navigate: vi.fn(() => Promise.resolve(true)),
  };
  TestBed.configureTestingModule({
    imports: [ChangePasswordComponent],
    providers: [
      { provide: AuthApiService, useValue: api },
      { provide: ApiClient, useValue: { me: meCall } },
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  const fixture = TestBed.createComponent(ChangePasswordComponent);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = (id: string, value: string) => {
    const element = root.querySelector(`#${id}`) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
  };
  const fill = () => {
    input('current-password', 'old private value');
    input('replacement-password', 'new private value');
    input('replacement-password-confirmation', 'new private value');
  };
  return { api, auth, fill, fixture, input, meCall, root, router };
}

describe('ChangePasswordComponent', () => {
  it('shows the expiry notice for a PASSWORD_EXPIRED session', () => {
    const { root } = setup(of(success), 'PASSWORD_EXPIRED');

    expect(root.textContent).toContain('password validity period has ended');
  });

  it('rejects mismatching entries in the browser without an HTTP request', () => {
    const { api, input, root } = setup();
    input('current-password', 'old private value');
    input('replacement-password', 'first new private value');
    input('replacement-password-confirmation', 'second new private value');

    const button = root.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(root.textContent).toContain('Passwords do not match.');
    button.click();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('rejects a short or unchanged new password before sending', () => {
    const { api, input, root } = setup();
    input('current-password', 'same private value');
    input('replacement-password', 'same private value');
    input('replacement-password-confirmation', 'same private value');

    expect(root.textContent).toContain('new password must differ');
    expect((root.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect(api.changePassword).not.toHaveBeenCalled();

    input('replacement-password', 'short');
    input('replacement-password-confirmation', 'short');
    expect(root.textContent).toContain('Use at least 12 characters.');
  });

  it('shows a wrong-current-password error and stays on the page', () => {
    const { fill, fixture, root, router } = setup(
      throwError(() => failure(400, 'CURRENT_PASSWORD_INCORRECT')),
    );
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('The current password is incorrect.');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('shows readable reused and policy errors without leaving', () => {
    const reused = setup(throwError(() => failure(400, 'PASSWORD_REUSED')));
    reused.fill();
    (reused.root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    reused.fixture.detectChanges();
    expect(reused.root.textContent).toContain('Choose a password you have not used recently.');

    TestBed.resetTestingModule();
    const policy = setup(
      throwError(() => failure(400, 'PASSWORD_POLICY_VIOLATION', ['TOO_LONG', 'COMMON_PASSWORD'])),
    );
    policy.fill();
    (policy.root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    policy.fixture.detectChanges();
    expect(policy.root.textContent).toContain('Use at most 128 characters.');
    expect(policy.root.textContent).toContain('not commonly used');
  });

  it('updates the rotated session, clears all inputs, and opens the dashboard on success', () => {
    const { auth, fill, fixture, root, router } = setup();
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(auth.setSession).toHaveBeenCalledWith(success);
    expect(fixture.componentInstance.form.getRawValue()).toStrictEqual({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('clears all inputs on cancel before opening the dashboard', () => {
    const { fill, fixture, root, router } = setup();
    fill();

    const cancel = [...root.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    cancel.click();

    expect(fixture.componentInstance.form.getRawValue()).toStrictEqual({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });

  it('clears auth and returns to login on 401', () => {
    const { auth, fill, root, router } = setup(throwError(() => failure(401, 'AUTH_REQUIRED')));
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('loads a changed policy from /me and revalidates the new password', () => {
    const updated = {
      ...fullMe,
      passwordPolicy: { minPasswordLength: 20, rejectPersonalDataInPassword: true },
    };
    const { auth, input, meCall, root } = setup(
      of(success),
      'FULLY_AUTHENTICATED',
      null,
      of(updated),
    );
    input('replacement-password', 'sixteen chars ok');

    expect(meCall).toHaveBeenCalledOnce();
    expect(auth.setSession).toHaveBeenCalledWith(updated);
    expect(root.textContent).toContain('Use at least 20 characters.');
  });

  it('returns to login when policy loading finds an expired session', () => {
    const { auth, router } = setup(
      of(success),
      'FULLY_AUTHENTICATED',
      null,
      throwError(() => failure(401, 'AUTH_REQUIRED')),
    );

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('shows a neutral message for an unexpected failure', () => {
    const { fill, fixture, root } = setup(throwError(() => failure(500, 'INTERNAL_ERROR')));
    fill();

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root.textContent).toContain('Could not change the password. Try again later.');
  });
});
