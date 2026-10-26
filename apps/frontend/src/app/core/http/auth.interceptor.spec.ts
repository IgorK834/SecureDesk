// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import type { AuthStage } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';
import { authInterceptor } from './auth.interceptor';

function setup(stage: AuthStage | null = 'FULLY_AUTHENTICATED') {
  const auth = { clear: vi.fn(), authStage: vi.fn(() => stage) };
  const router = {
    navigate: vi.fn(() => Promise.resolve(true)),
    navigateByUrl: vi.fn(() => Promise.resolve(true)),
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: router },
    ],
  });
  return {
    auth,
    client: TestBed.inject(HttpClient),
    http: TestBed.inject(HttpTestingController),
    router,
  };
}

describe('authInterceptor', () => {
  it('clears auth and opens the inactivity banner after a protected 401', () => {
    const { auth, client, http, router } = setup();
    client.get('/api/tickets').subscribe({ error: () => undefined });
    http.expectOne('/api/tickets').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.clear).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it.each([
    ['POST', '/api/auth/login'],
    ['GET', '/api/auth/me'],
  ] as const)('does not redirect a bootstrap %s %s 401', (method, url) => {
    const { auth, client, http, router } = setup(null);
    client.request(method, url).subscribe({ error: () => undefined });
    http.expectOne(url).flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.clear).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it.each([
    ['INITIAL_PASSWORD_CHANGE', '/change-initial-password'],
    ['PASSWORD_EXPIRED', '/account/change-password'],
  ] as const)('sends a restricted %s session to %s', (stage, destination) => {
    const { client, http, router } = setup(stage);
    client.get('/api/private').subscribe({ error: () => undefined });
    http
      .expectOne('/api/private')
      .flush(
        { error: { code: 'AUTH_PASSWORD_CHANGE_REQUIRED' } },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(router.navigateByUrl).toHaveBeenCalledWith(destination);
  });

  it('shows the shared forbidden route for an ordinary 403', () => {
    const { client, http, router } = setup();
    client.get('/api/private').subscribe({ error: () => undefined });
    http
      .expectOne('/api/private')
      .flush({ error: { code: 'AUTH_FORBIDDEN' } }, { status: 403, statusText: 'Forbidden' });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/forbidden');
  });

  it('sends a second-factor refusal to the TOTP challenge instead of Forbidden', () => {
    const { client, http, router } = setup('TOTP_CHALLENGE');
    client.get('/api/private').subscribe({ error: () => undefined });
    http
      .expectOne('/api/private')
      .flush({ error: { code: 'AUTH_TOTP_REQUIRED' } }, { status: 403, statusText: 'Forbidden' });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/totp-challenge');
  });
});
