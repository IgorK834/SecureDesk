import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { LoginResponse, PasswordChangeResponse } from './auth.models';

export interface LoginRequest {
  login: string;
  password: string;
}

export interface ChangeInitialPasswordRequest {
  newPassword: string;
  confirmNewPassword: string;
}

export interface ChangePasswordRequest extends ChangeInitialPasswordRequest {
  currentPassword: string;
}

/** Typed, same-origin client for the authentication operations used by the three auth forms. */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  login(body: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', body);
  }

  changeInitialPassword(body: ChangeInitialPasswordRequest): Observable<PasswordChangeResponse> {
    return this.http.post<PasswordChangeResponse>('/api/auth/change-initial-password', body);
  }

  changePassword(body: ChangePasswordRequest): Observable<PasswordChangeResponse> {
    return this.http.post<PasswordChangeResponse>('/api/auth/change-password', body);
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null);
  }
}
