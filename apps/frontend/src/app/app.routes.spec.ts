// @vitest-environment jsdom
import './__fixtures__/test-environment';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { meResponse } from './__fixtures__/session';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import type { MeResponse, Role } from './core/auth/auth.models';

// These tests run the real app configuration (router, guards, lazy routes, and the initializer
// that restores the session at start-up). Only the network is replaced: `/api/auth/me` is
// answered by the test, like the server would for a given cookie (or for none).
//
// Starting the app = what a hard reload does: the initializer asks the server who the cookie
// belongs to, and only then does the first navigation happen.

async function startApp(me: MeResponse | null) {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const initialized = TestBed.inject(ApplicationInitStatus).donePromise;

  const request = http.expectOne('/api/auth/me');
  expect(request.request.method).toBe('GET');
  if (me) {
    request.flush(me);
  } else {
    request.flush(
      { error: { code: 'AUTH_REQUIRED', message: 'Wymagane zalogowanie' } },
      { status: 401, statusText: 'Unauthorized' },
    );
  }
  await initialized;

  const harness = await RouterTestingHarness.create();
  return {
    http,
    /** Opens a URL the way typing it into the address bar would; returns where the user ended up. */
    async open(url: string) {
      await harness.navigateByUrl(url);
      return TestBed.inject(Router).url;
    },
    page: () => (harness.routeNativeElement as HTMLElement | null)?.textContent ?? '',
  };
}

/** Every route of the inventory, as a concrete URL, so a route added later is covered too. */
const ALL_URLS = routes
  .map((route) => route.path)
  .filter((path): path is string => !!path)
  .map((path) => `/${path.replace(':id', '42').replace('**', 'no/such/page')}`);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('reload (session restored from the server cookie)', () => {
  it('keeps the user on /dashboard without asking for credentials', async () => {
    const app = await startApp(meResponse('MANAGER'));

    expect(await app.open('/dashboard')).toBe('/dashboard');

    expect(app.page()).toContain('Manager dashboard');
    // The only server call was the start-up `/api/auth/me`; no login request was made.
    app.http.verify();
  });

  it('sends a visitor without a valid cookie from /dashboard to /login, quietly', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = await startApp(null);

    expect(await app.open('/dashboard')).toBe('/login');
    // A real 401 through the real HttpClient is "nobody signed in", not a fault worth logging.
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('opens the root URL on the dashboard', async () => {
    const app = await startApp(meResponse('GUEST'));

    expect(await app.open('/')).toBe('/dashboard');
  });
});

describe('each role lands on its own dashboard', () => {
  it.each([
    ['ADMINISTRATOR', 'Administrator dashboard'],
    ['MANAGER', 'Manager dashboard'],
    ['EMPLOYEE', 'Employee dashboard'],
    ['GUEST', 'Guest dashboard'],
  ] as [Role, string][])('%s -> "%s"', async (role, heading) => {
    const app = await startApp(meResponse(role));

    await app.open('/dashboard');

    expect(app.page()).toContain(heading);
  });
});

describe('anonymous visitor', () => {
  it('may open /login', async () => {
    const app = await startApp(null);

    expect(await app.open('/login')).toBe('/login');
  });

  it.each(ALL_URLS.filter((url) => url !== '/login'))('is sent from %s to /login', async (url) => {
    const app = await startApp(null);

    expect(await app.open(url)).toBe('/login');
  });
});

describe('signed-in user on /login', () => {
  it('is sent on to the dashboard', async () => {
    const app = await startApp(meResponse('EMPLOYEE'));

    expect(await app.open('/login')).toBe('/dashboard');
  });
});

describe('role-specific pages (Angular guards, UX only)', () => {
  const ADMIN_URLS = ['/admin/users', '/admin/users/new', '/admin/users/42', '/admin/security'];
  const TICKET_URLS = ['/tickets', '/tickets/new', '/tickets/42'];

  describe.each(['MANAGER', 'EMPLOYEE', 'GUEST'] as Role[])('%s', (role) => {
    it.each(ADMIN_URLS)('is redirected from %s to /forbidden', async (url) => {
      const app = await startApp(meResponse(role));

      expect(await app.open(url)).toBe('/forbidden');
      expect(app.page()).toContain('Access denied');
    });

    it.each(TICKET_URLS)('may open %s', async (url) => {
      const app = await startApp(meResponse(role));

      expect(await app.open(url)).toBe(url);
    });
  });

  describe('ADMINISTRATOR', () => {
    it.each(ADMIN_URLS)('may open %s', async (url) => {
      const app = await startApp(meResponse('ADMINISTRATOR'));

      expect(await app.open(url)).toBe(url);
    });

    it.each(TICKET_URLS)('is redirected from %s to /forbidden', async (url) => {
      const app = await startApp(meResponse('ADMINISTRATOR'));

      expect(await app.open(url)).toBe('/forbidden');
    });
  });
});

describe('every route outside the allowed password-change page', () => {
  describe('INITIAL_PASSWORD_CHANGE session', () => {
    const me = meResponse('EMPLOYEE', 'INITIAL_PASSWORD_CHANGE');

    it.each(ALL_URLS.filter((url) => url !== '/change-initial-password'))(
      'is redirected from %s to /change-initial-password',
      async (url) => {
        const app = await startApp(me);

        expect(await app.open(url)).toBe('/change-initial-password');
      },
    );

    it('is redirected from the root URL as well', async () => {
      const app = await startApp(me);

      expect(await app.open('/')).toBe('/change-initial-password');
    });

    it('may stay on /change-initial-password', async () => {
      const app = await startApp(me);

      expect(await app.open('/change-initial-password')).toBe('/change-initial-password');
    });
  });

  describe('PASSWORD_EXPIRED session', () => {
    const me = meResponse('MANAGER', 'PASSWORD_EXPIRED');

    it.each(ALL_URLS.filter((url) => url !== '/account/change-password'))(
      'is redirected from %s to /account/change-password',
      async (url) => {
        const app = await startApp(me);

        expect(await app.open(url)).toBe('/account/change-password');
      },
    );
  });
});

describe('error pages', () => {
  it('shows the forbidden page with a way back', async () => {
    const app = await startApp(meResponse('GUEST'));

    expect(await app.open('/forbidden')).toBe('/forbidden');
    expect(app.page()).toContain('Access denied');
  });

  it('shows the not-found page for an unknown URL, still signed in', async () => {
    const app = await startApp(meResponse('GUEST'));

    expect(await app.open('/no/such/page')).toBe('/no/such/page');
    expect(app.page()).toContain('Page not found');
  });
});

describe('routes owned by later tasks', () => {
  it('open a titled placeholder rather than a blank page', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));

    await app.open('/admin/security');

    expect(app.page()).toContain('Security settings');
  });
});
