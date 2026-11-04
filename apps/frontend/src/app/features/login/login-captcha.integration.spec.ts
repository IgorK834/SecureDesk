// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { CaptchaApiService } from '../../shared/ui/captcha/captcha-api.service';
import { LoginComponent } from './login.component';

describe('LoginComponent with the internal CAPTCHA provider', () => {
  it('submits the challenge proof and requests a fresh challenge after submission', async () => {
    const me = meResponse('EMPLOYEE');
    const login = vi.fn(() =>
      of({ user: me.user, authStage: me.authStage, mustChangePassword: me.mustChangePassword }),
    );
    let sequence = 0;
    const challenge = vi.fn(() =>
      of({
        challengeId: `challenge-${++sequence}`,
        image: 'data:image/svg+xml;base64,PHN2Zy8+',
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        instruction: 'Type the characters in reverse order',
      }),
    );
    const auth = { setSession: vi.fn(), load: vi.fn(() => Promise.resolve()) };
    const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthApiService, useValue: { login } },
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
        {
          provide: CaptchaApiService,
          useValue: {
            config: () => of({ provider: 'internal', action: 'login' }),
            challenge,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const fill = (selector: string, value: string) => {
      const input = root.querySelector(selector) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    fill('#login', 'employee1');
    fill('#captcha-answer', 'TEST-SOLVED');
    fill('#password', 'private value');

    (root.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await Promise.resolve();
    fixture.detectChanges();

    expect(login).toHaveBeenCalledWith({
      login: 'employee1',
      password: 'private value',
      captcha: { challengeId: 'challenge-1', answer: 'TEST-SOLVED' },
    });
    expect(challenge).toHaveBeenCalledTimes(2);
    expect(auth.setSession).toHaveBeenCalledOnce();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
  });
});
