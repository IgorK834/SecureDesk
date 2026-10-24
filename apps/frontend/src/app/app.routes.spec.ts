// @vitest-environment jsdom
import './__fixtures__/test-environment';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { adminUser, userPage } from './__fixtures__/admin-users';
import { installDialogPolyfill } from './__fixtures__/dialog';
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
    harness,
    /** Lets the promise chains that follow a click or a response run, then renders the result. */
    async render() {
      await new Promise((resolve) => setTimeout(resolve, 0));
      harness.detectChanges();
    },
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
    app.http
      .expectOne('/api/tickets?limit=100&offset=0')
      .flush({ items: [], limit: 100, offset: 0, total: 0 });
    // No login request was made; only the dashboard summary followed the start-up `/api/auth/me`.
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

describe('password route', () => {
  it('opens the change-password form', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));

    await app.open('/account/change-password');

    expect(app.page()).toContain('Change password');
    expect(app.page()).toContain('Current password');
  });
});

describe('the admin user pages, wired to the real HTTP client', () => {
  beforeAll(installDialogPolyfill);

  const isUsers = (r: { url: string }) => r.url.startsWith('/api/admin/users');
  const created = adminUser({
    id: 'u-new',
    login: 'new.user',
    firstName: 'Nowy',
    lastName: 'Użytkownik',
    role: 'GUEST',
    mustChangePassword: true,
  });

  type App = Awaited<ReturnType<typeof startApp>>;
  const root = (app: App) => app.harness.routeNativeElement as HTMLElement;
  const click = (app: App, label: string) =>
    [...root(app).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)?.click();

  it('lists the accounts: one GET with the page and its size, then the rows', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users');
    app.harness.detectChanges();

    const request = app.http.expectOne(isUsers);
    expect(request.request.method).toBe('GET');
    expect(request.request.url).toBe('/api/admin/users');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush(userPage([adminUser({ login: 'jan.k' })]));
    await app.render();

    expect(app.page()).toContain('jan.k');
  });

  it('turns a Manager away without asking the server for any user data', async () => {
    const app = await startApp(meResponse('MANAGER'));

    expect(await app.open('/admin/users')).toBe('/forbidden');
    await app.render();

    app.http.expectNone(isUsers);
    expect(app.page()).toContain('Access denied');
  });

  it("shows the server's 403 as a message even though the session said the page is allowed", async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users');
    app.harness.detectChanges();

    app.http
      .expectOne(isUsers)
      .flush(
        { error: { code: 'AUTH_FORBIDDEN', message: 'x' } },
        { status: 403, statusText: 'Forbidden' },
      );
    await app.render();

    expect(app.page()).toContain('Access denied');
  });

  it('shows the not-found page for an account the server does not have (404)', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users/42');
    app.harness.detectChanges();

    const request = app.http.expectOne('/api/admin/users/42');
    expect(request.request.method).toBe('GET');
    request.flush(
      { error: { code: 'NOT_FOUND', message: 'x' } },
      { status: 404, statusText: 'Not Found' },
    );
    await app.render();

    expect(app.page()).toContain('Page not found');
  });

  it('creates an account: POSTs the trimmed form, shows the password once, then opens the account', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users/new');
    app.harness.detectChanges();
    const set = (id: string, value: string, event: string) => {
      const control = root(app).querySelector(`#${id}`) as HTMLInputElement;
      control.value = value;
      control.dispatchEvent(new Event(event));
    };
    set('user-login', ' new.user ', 'input');
    set('user-first-name', 'Nowy', 'input');
    set('user-last-name', 'Użytkownik', 'input');
    set('user-role', 'GUEST', 'change');

    click(app, 'Create account');

    const post = app.http.expectOne(isUsers);
    expect(post.request.method).toBe('POST');
    expect(post.request.url).toBe('/api/admin/users');
    expect(post.request.body).toStrictEqual({
      login: 'new.user',
      firstName: 'Nowy',
      lastName: 'Użytkownik',
      role: 'GUEST',
    });
    post.flush(
      {
        user: created,
        temporaryPassword: { value: 'Tmp-Secret-9xQ4zLm2', expiresAt: '2030-01-02T00:00:00.000Z' },
      },
      { status: 201, statusText: 'Created' },
    );
    await app.render();
    expect(root(app).querySelector<HTMLInputElement>('#temporary-password-value')?.value).toBe(
      'Tmp-Secret-9xQ4zLm2',
    );
    expect(TestBed.inject(Router).url).toBe('/admin/users/new');

    click(app, 'I have saved the password');
    await app.render();

    expect(TestBed.inject(Router).url).toBe('/admin/users/u-new');
    app.http.expectOne('/api/admin/users/u-new').flush(created);
    await app.render();
    expect(app.page()).toContain('new.user');
    expect(app.page()).not.toContain('Tmp-Secret-9xQ4zLm2');
  });

  it('blocks an account: confirms, POSTs with no body, then shows it blocked', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users/u-1');
    app.harness.detectChanges();
    app.http.expectOne('/api/admin/users/u-1').flush(adminUser({ id: 'u-1' }));
    await app.render();

    click(app, 'Block');
    await app.render();
    app.http.expectNone((r) => r.method === 'POST');
    click(app, 'Block account');
    await app.render();

    const post = app.http.expectOne((r) => r.method === 'POST');
    expect(post.request.url).toBe('/api/admin/users/u-1/block');
    expect(post.request.body).toBeNull();
    post.flush(adminUser({ id: 'u-1', isBlocked: true }));
    await app.render();
    expect(root(app).querySelector('app-user-status-badge')?.textContent).toContain('Blocked');
  });

  it('deletes an account: confirms, sends DELETE, then returns to a list that asks the server again', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users/u-1');
    app.harness.detectChanges();
    app.http.expectOne('/api/admin/users/u-1').flush(adminUser({ id: 'u-1' }));
    await app.render();

    click(app, 'Delete');
    await app.render();
    click(app, 'Delete account');
    await app.render();

    const del = app.http.expectOne((r) => r.method === 'DELETE');
    expect(del.request.url).toBe('/api/admin/users/u-1');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await app.render();

    expect(TestBed.inject(Router).url).toBe('/admin/users');
    const list = app.http.expectOne(isUsers);
    expect(list.request.method).toBe('GET');
    list.flush(userPage([]));
    await app.render();
    expect(app.page()).toContain('No users match these filters.');
  });

  it('resets a password: confirms, POSTs an empty JSON object, shows the password once, then drops it', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/users/u-1');
    app.harness.detectChanges();
    app.http.expectOne('/api/admin/users/u-1').flush(adminUser({ id: 'u-1' }));
    await app.render();

    click(app, 'Reset password');
    await app.render();
    app.http.expectNone((r) => r.method === 'POST');
    (
      root(app).querySelector(
        'dialog[aria-labelledby="confirm-dialog-title"] button.confirm',
      ) as HTMLButtonElement
    ).click();
    await app.render();

    const post = app.http.expectOne((r) => r.method === 'POST');
    expect(post.request.url).toBe('/api/admin/users/u-1/reset-password');
    expect(post.request.body).toStrictEqual({});
    post.flush({
      temporaryPassword: { value: 'Reset-Secret-4wNq8Tz1', expiresAt: '2030-01-01T12:00:00.000Z' },
    });
    await app.render();
    expect(root(app).querySelector<HTMLInputElement>('#temporary-password-value')?.value).toBe(
      'Reset-Secret-4wNq8Tz1',
    );
    expect(TestBed.inject(Router).url).toBe('/admin/users/u-1');

    click(app, 'I have saved the password');
    await app.render();

    expect(app.page()).not.toContain('Reset-Secret-4wNq8Tz1');
    expect(TestBed.inject(Router).url).toBe('/admin/users/u-1');
  });
});

describe('the security settings page, wired to the real HTTP client', () => {
  const URL = '/api/admin/security-settings';
  const SETTINGS = {
    minPasswordLength: 12,
    rejectPersonalDataInPassword: false,
    passwordMaxAgeDays: null,
    sessionIdleTimeoutMinutes: 15,
  };
  type App = Awaited<ReturnType<typeof startApp>>;
  const root = (app: App) => app.harness.routeNativeElement as HTMLElement;
  const field = (app: App, id: string) => root(app).querySelector(`#${id}`) as HTMLInputElement;

  it('loads the settings with one GET and shows them', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/security');
    app.harness.detectChanges();

    const request = app.http.expectOne(URL);
    expect(request.request.method).toBe('GET');
    request.flush({ ...SETTINGS, minPasswordLength: 20, passwordMaxAgeDays: 90 });
    await app.render();

    expect(app.page()).toContain('Security settings');
    expect(field(app, 'min-password-length').value).toBe('20');
    expect(field(app, 'max-age').value).toBe('90');
    expect(field(app, 'idle-timeout').value).toBe('15');
  });

  it('saves with one PATCH carrying all four values, then shows what the server stored', async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/security');
    app.harness.detectChanges();
    app.http.expectOne(URL).flush(SETTINGS);
    await app.render();
    const min = field(app, 'min-password-length');
    min.value = '16';
    min.dispatchEvent(new Event('input'));
    const personal = field(app, 'reject-personal-data');
    personal.checked = true;
    personal.dispatchEvent(new Event('change'));

    (root(app).querySelector('button[type="submit"]') as HTMLButtonElement).click();

    const patch = app.http.expectOne((r) => r.method === 'PATCH');
    expect(patch.request.url).toBe(URL);
    expect(patch.request.body).toStrictEqual({
      minPasswordLength: 16,
      rejectPersonalDataInPassword: true,
      passwordMaxAgeDays: null,
      sessionIdleTimeoutMinutes: 15,
    });
    patch.flush({ ...SETTINGS, minPasswordLength: 16, rejectPersonalDataInPassword: true });
    await app.render();
    expect(app.page()).toContain('Settings saved.');
  });

  it('turns a Manager away without asking the server for the settings', async () => {
    const app = await startApp(meResponse('MANAGER'));

    expect(await app.open('/admin/security')).toBe('/forbidden');
    await app.render();

    app.http.expectNone(URL);
    expect(app.page()).toContain('Access denied');
  });

  it("shows the server's 403 as a message even though the session said the page is allowed", async () => {
    const app = await startApp(meResponse('ADMINISTRATOR'));
    await app.open('/admin/security');
    app.harness.detectChanges();

    app.http
      .expectOne(URL)
      .flush(
        { error: { code: 'AUTH_FORBIDDEN', message: 'x' } },
        { status: 403, statusText: 'Forbidden' },
      );
    await app.render();

    expect(app.page()).toContain('Access denied');
  });
});
