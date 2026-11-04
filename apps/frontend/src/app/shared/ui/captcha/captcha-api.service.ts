import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type CaptchaPurpose = 'login' | 'change-password';
export type CaptchaProof = { token: string } | { challengeId: string; answer: string };

export interface CaptchaConfig {
  provider: 'turnstile' | 'internal' | 'recaptcha';
  siteKey?: string;
  action: string;
}

export interface InternalCaptchaChallenge {
  challengeId: string;
  image: string;
  expiresAt: string;
  instruction: string;
}

@Injectable({ providedIn: 'root' })
export class CaptchaApiService {
  private readonly http = inject(HttpClient);

  config(purpose: CaptchaPurpose): Observable<CaptchaConfig> {
    return this.http.get<CaptchaConfig>('/api/captcha/config', { params: { purpose } });
  }

  challenge(purpose: CaptchaPurpose): Observable<InternalCaptchaChallenge> {
    return this.http.post<InternalCaptchaChallenge>('/api/captcha/challenge', { purpose });
  }
}
