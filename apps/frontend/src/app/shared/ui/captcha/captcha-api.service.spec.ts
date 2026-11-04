import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector } from '@angular/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { CaptchaApiService } from './captcha-api.service';

describe('CaptchaApiService', () => {
  it('loads the server-selected provider from the same-origin config endpoint', async () => {
    const config = { provider: 'turnstile', siteKey: 'site', action: 'change-password' };
    const get = vi.fn(() => of(config));
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: { get } },
        { provide: CaptchaApiService, useClass: CaptchaApiService },
      ],
    });

    await expect(
      firstValueFrom(injector.get(CaptchaApiService).config('change-password')),
    ).resolves.toBe(config);
    expect(get).toHaveBeenCalledWith('/api/captcha/config', {
      params: { purpose: 'change-password' },
    });
  });

  it('requests an internal challenge without selecting the provider client-side', async () => {
    const challenge = {
      challengeId: 'challenge-1',
      image: 'data:image/svg+xml;base64,PHN2Zy8+',
      expiresAt: '2026-11-04T12:02:00.000Z',
      instruction: 'Type the characters in reverse order',
    };
    const post = vi.fn(() => of(challenge));
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: { post } },
        { provide: CaptchaApiService, useClass: CaptchaApiService },
      ],
    });

    await expect(firstValueFrom(injector.get(CaptchaApiService).challenge('login'))).resolves.toBe(
      challenge,
    );
    expect(post).toHaveBeenCalledWith('/api/captcha/challenge', { purpose: 'login' });
  });
});
