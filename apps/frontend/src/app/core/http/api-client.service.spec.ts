// Plain Vitest (root config) has no Angular compiler plugin, so the JIT compiler is
// loaded explicitly for the @Injectable decorator. Harmless under `ng test`.
import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { meResponse } from '../../__fixtures__/session';
import { ApiClient } from './api-client.service';

function createClient(get: ReturnType<typeof vi.fn>): ApiClient {
  const injector = Injector.create({
    providers: [
      { provide: HttpClient, useValue: { get }, deps: [] },
      { provide: ApiClient, useClass: ApiClient, deps: [] },
    ],
  });
  return injector.get(ApiClient);
}

describe('ApiClient.health()', () => {
  it('issues a GET to the relative /api/health URL, never to an absolute origin', async () => {
    const get = vi.fn().mockReturnValue(of({ status: 'ok' }));

    await firstValueFrom(createClient(get).health());

    expect(get).toHaveBeenCalledTimes(1);
    const url = get.mock.calls[0]?.[0] as string;
    expect(url).toBe('/api/health');
    // Same-origin is a security requirement (strict cookies, no CORS): no scheme/host allowed.
    expect(url).not.toMatch(/^[a-z]+:\/\//i);
  });

  it('emits the typed body returned by the backend', async () => {
    const get = vi.fn().mockReturnValue(of({ status: 'ok' }));

    await expect(firstValueFrom(createClient(get).health())).resolves.toStrictEqual({
      status: 'ok',
    });
  });
});

describe('ApiClient.me()', () => {
  it('issues a GET to the relative /api/auth/me URL and emits the body unchanged', async () => {
    const body = meResponse('EMPLOYEE');
    const get = vi.fn().mockReturnValue(of(body));

    await expect(firstValueFrom(createClient(get).me())).resolves.toStrictEqual(body);

    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe('/api/auth/me');
  });
});
