import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthApiService } from './auth-api.service';

function createApi(post: ReturnType<typeof vi.fn>): AuthApiService {
  return Injector.create({
    providers: [
      { provide: HttpClient, useValue: { post } },
      { provide: AuthApiService, useClass: AuthApiService },
    ],
  }).get(AuthApiService);
}

describe('AuthApiService', () => {
  const assertPost = async (
    url: string,
    requestBody: object,
    call: (api: AuthApiService) => Observable<unknown>,
  ) => {
    const post = vi.fn(() => of({}));
    await firstValueFrom(call(createApi(post)));
    expect(post).toHaveBeenCalledWith(url, requestBody);
    expect(url).not.toMatch(/^[a-z]+:\/\//i);
  };

  it('POSTs login to the same-origin endpoint', async () => {
    const body = { login: 'employee', password: 'private value' };
    await assertPost('/api/auth/login', body, (api) => api.login(body));
  });

  it('POSTs initial password changes to the same-origin endpoint', async () => {
    const body = { newPassword: 'new private value', confirmNewPassword: 'new private value' };
    await assertPost('/api/auth/change-initial-password', body, (api) =>
      api.changeInitialPassword(body),
    );
  });

  it('POSTs ordinary password changes to the same-origin endpoint', async () => {
    const body = {
      currentPassword: 'old private value',
      newPassword: 'new private value',
      confirmNewPassword: 'new private value',
    };
    await assertPost('/api/auth/change-password', body, (api) => api.changePassword(body));
  });

  it('POSTs logout without credentials in the body', async () => {
    const post = vi.fn(() => of(undefined));

    await firstValueFrom(createApi(post).logout());

    expect(post).toHaveBeenCalledWith('/api/auth/logout', null);
  });
});
