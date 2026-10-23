// @vitest-environment jsdom
import '../../__fixtures__/test-environment';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { adminUser, userPage } from '../../__fixtures__/admin-users';
import { AdminApi } from './admin-api.service';

function setUp() {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(AdminApi), http: TestBed.inject(HttpTestingController) };
}

describe('AdminApi.list', () => {
  it('asks for the page and page size, and for nothing else when there are no filters', () => {
    const { api, http } = setUp();
    let result;
    api.list({ page: 1, pageSize: 20 }).subscribe((r) => (result = r));

    const request = http.expectOne((r) => r.url === '/api/admin/users');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toStrictEqual(['page', 'pageSize']);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('20');
    request.flush(userPage([adminUser()]));
    expect(result).toStrictEqual(userPage([adminUser()]));
    http.verify();
  });

  it('sends the search text trimmed, the role and the status', () => {
    const { api, http } = setUp();
    api.list({ q: '  ali  ', role: 'GUEST', status: 'pending', page: 3, pageSize: 20 }).subscribe();

    const { request } = http.expectOne((r) => r.url === '/api/admin/users');

    expect(request.params.get('q')).toBe('ali');
    expect(request.params.get('role')).toBe('GUEST');
    expect(request.params.get('status')).toBe('pending');
    expect(request.params.get('page')).toBe('3');
    http.verify();
  });

  it.each([undefined, '', '   '])('leaves out the search text %j', (q) => {
    const { api, http } = setUp();
    api.list({ q, page: 1, pageSize: 20 }).subscribe();

    const { request } = http.expectOne((r) => r.url === '/api/admin/users');

    expect(request.params.has('q')).toBe(false);
    http.verify();
  });

  it('encodes special characters in the search text rather than putting them in the URL as typed', () => {
    const { api, http } = setUp();
    api.list({ q: '100%&role=ADMINISTRATOR', page: 1, pageSize: 20 }).subscribe();

    const request = http.expectOne((r) => r.url === '/api/admin/users');

    expect(request.request.params.get('q')).toBe('100%&role=ADMINISTRATOR');
    expect(request.request.urlWithParams).not.toContain('&role=ADMINISTRATOR');
    expect(request.request.params.has('role')).toBe(false);
    http.verify();
  });
});

describe('AdminApi: one account', () => {
  it('get: GET /api/admin/users/:id', () => {
    const { api, http } = setUp();
    api.get('u-1').subscribe();

    const request = http.expectOne('/api/admin/users/u-1');

    expect(request.request.method).toBe('GET');
    http.verify();
  });

  it('puts the id in the path encoded, so it cannot add path segments or a query', () => {
    const { api, http } = setUp();
    api.get('../tickets?x=1#y').subscribe();

    const request = http.expectOne((r) => r.url.startsWith('/api/admin/users/'));

    expect(request.request.url).toBe('/api/admin/users/..%2Ftickets%3Fx%3D1%23y');
    http.verify();
  });

  it('create: POST the body to /api/admin/users and returns the one-time password response', () => {
    const { api, http } = setUp();
    const body = { login: 'newbie', firstName: 'Nowy', lastName: 'Test', role: 'GUEST' } as const;
    let result;
    api.create(body).subscribe((r) => (result = r));

    const request = http.expectOne('/api/admin/users');
    const created = {
      user: adminUser({ login: 'newbie' }),
      temporaryPassword: { value: 'x'.repeat(16), expiresAt: '2030-01-01T12:00:00.000Z' },
    };
    request.flush(created);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toStrictEqual(body);
    expect(result).toStrictEqual(created);
    http.verify();
  });

  it('update: PATCH only what it is given', () => {
    const { api, http } = setUp();
    api.update('u-1', { firstName: 'Zofia' }).subscribe();

    const request = http.expectOne('/api/admin/users/u-1');

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toStrictEqual({ firstName: 'Zofia' });
    http.verify();
  });

  it.each([
    ['block', (api: AdminApi) => api.block('u-1'), '/api/admin/users/u-1/block'],
    ['unblock', (api: AdminApi) => api.unblock('u-1'), '/api/admin/users/u-1/unblock'],
  ])('%s: POST with no body to %s', (_name, call, url) => {
    const { api, http } = setUp();
    call(api).subscribe();

    const request = http.expectOne(url);

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toBeNull();
    http.verify();
  });

  it('delete: DELETE /api/admin/users/:id and completes on the empty 204', () => {
    const { api, http } = setUp();
    let completed = false;
    api.delete('u-1').subscribe({ complete: () => (completed = true) });

    const request = http.expectOne('/api/admin/users/u-1');
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(request.request.method).toBe('DELETE');
    expect(completed).toBe(true);
    http.verify();
  });

  it('only ever calls its own origin: every URL is relative', () => {
    const { api, http } = setUp();
    api.list({ page: 1, pageSize: 20 }).subscribe();
    api.get('a').subscribe();
    api.delete('a').subscribe();
    api.resetPassword('a').subscribe();

    for (const request of http.match(() => true)) {
      expect(request.request.url).toMatch(/^\/api\/admin\/users/);
    }
  });
});

describe('AdminApi.resetPassword', () => {
  it('POSTs an empty JSON object to /api/admin/users/:id/reset-password and returns the answer', () => {
    const { api, http } = setUp();
    let result;
    api.resetPassword('u-1').subscribe((r) => (result = r));

    const request = http.expectOne('/api/admin/users/u-1/reset-password');
    request.flush({
      temporaryPassword: { value: 'k9#Tq2!vXm7@Lp4w', expiresAt: '2030-01-01T12:00:00.000Z' },
    });

    expect(request.request.method).toBe('POST');
    // `{}`, not null: the server wants JSON, so that a plain form post cannot trigger a reset.
    expect(request.request.body).toStrictEqual({});
    expect(result).toStrictEqual({
      temporaryPassword: { value: 'k9#Tq2!vXm7@Lp4w', expiresAt: '2030-01-01T12:00:00.000Z' },
    });
    http.verify();
  });

  it('puts the id in the path encoded, so it cannot add path segments or a query', () => {
    const { api, http } = setUp();
    api.resetPassword('a/b?c=1').subscribe();

    const request = http.expectOne((r) => r.url.endsWith('/reset-password'));

    expect(request.request.url).toBe('/api/admin/users/a%2Fb%3Fc%3D1/reset-password');
    http.verify();
  });
});

describe('AdminApi: security settings', () => {
  const SETTINGS = {
    minPasswordLength: 12,
    rejectPersonalDataInPassword: false,
    passwordMaxAgeDays: null,
    sessionIdleTimeoutMinutes: 15,
  };

  it('getSecuritySettings: GET /api/admin/security-settings', () => {
    const { api, http } = setUp();
    let result;
    api.getSecuritySettings().subscribe((r) => (result = r));

    const request = http.expectOne('/api/admin/security-settings');
    request.flush(SETTINGS);

    expect(request.request.method).toBe('GET');
    expect(result).toStrictEqual(SETTINGS);
    http.verify();
  });

  it('updateSecuritySettings: PATCH exactly the settings it is given, and returns all four', () => {
    const { api, http } = setUp();
    let result;
    api.updateSecuritySettings({ minPasswordLength: 16 }).subscribe((r) => (result = r));

    const request = http.expectOne('/api/admin/security-settings');
    request.flush({ ...SETTINGS, minPasswordLength: 16 });

    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toStrictEqual({ minPasswordLength: 16 });
    expect(result).toStrictEqual({ ...SETTINGS, minPasswordLength: 16 });
    http.verify();
  });

  it('keeps a null maximum age as null in the body: that is how expiry is turned off', () => {
    const { api, http } = setUp();
    api.updateSecuritySettings({ passwordMaxAgeDays: null }).subscribe();

    const request = http.expectOne('/api/admin/security-settings');

    expect(JSON.stringify(request.request.body)).toBe('{"passwordMaxAgeDays":null}');
    http.verify();
  });

  it('calls its own origin only', () => {
    const { api, http } = setUp();
    api.getSecuritySettings().subscribe();
    api.updateSecuritySettings({ sessionIdleTimeoutMinutes: 5 }).subscribe();

    for (const request of http.match(() => true)) {
      expect(request.request.url).toBe('/api/admin/security-settings');
    }
  });
});
