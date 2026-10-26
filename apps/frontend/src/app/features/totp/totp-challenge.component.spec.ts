// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { TotpChallengeComponent } from './totp-challenge.component';

const response = {
  user: {
    id: 'u1',
    login: 'employee1',
    firstName: 'Ann',
    lastName: 'Test',
    role: 'EMPLOYEE' as const,
  },
  authStage: 'FULLY_AUTHENTICATED' as const,
};

function setup(completeTotpChallenge = vi.fn(() => of(response))) {
  const auth = { setSession: vi.fn(), load: vi.fn(() => Promise.resolve()) };
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    imports: [TotpChallengeComponent],
    providers: [
      { provide: AuthApiService, useValue: { completeTotpChallenge } },
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  const fixture = TestBed.createComponent(TotpChallengeComponent);
  fixture.detectChanges();
  return { fixture, completeTotpChallenge, auth, router };
}

afterEach(() => vi.restoreAllMocks());

describe('TotpChallengeComponent', () => {
  it('requires a six-digit one-time code, completes the session and navigates to the dashboard', async () => {
    const { fixture, completeTotpChallenge, auth, router } = setup();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(input.autocomplete).toBe('one-time-code');
    expect(button.disabled).toBe(true);
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    button.click();

    expect(completeTotpChallenge).toHaveBeenCalledWith({ code: '123456' });
    expect(auth.setSession).toHaveBeenCalledWith(response);
    await Promise.resolve();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(document.location.href).not.toContain('123456');
  });

  it('prevents duplicate submissions while a request is pending', () => {
    const pending = new Subject<typeof response>();
    const { fixture, completeTotpChallenge } = setup(vi.fn(() => pending));
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    button.click();
    button.click();
    fixture.detectChanges();

    expect(completeTotpChallenge).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
  });

  it('clears an invalid code and shows a neutral error', () => {
    const { fixture } = setup(
      vi.fn(() =>
        throwError(() => ({ status: 400, error: { error: { code: 'TOTP_INVALID_CODE' } } })),
      ),
    );
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(fixture.nativeElement.textContent).toContain(
      'The authentication code is invalid or has expired.',
    );
  });

  it('maps throttling to a neutral retry-later message', () => {
    const { fixture } = setup(
      vi.fn(() => throwError(() => new HttpErrorResponse({ status: 429 }))),
    );
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form') as HTMLFormElement).dispatchEvent(
      new Event('submit'),
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Too many attempts. Try again later.');
  });
});
