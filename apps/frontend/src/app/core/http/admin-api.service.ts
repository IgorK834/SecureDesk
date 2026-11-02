import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Role } from '../auth/auth.models';

/**
 * An account as the administrator's user management shows it (`AdminUserDto` on the server): no
 * password hash, no session token. Dates are ISO-8601 strings, as they arrive in JSON.
 */
export interface AdminUser {
  id: string;
  login: string;
  firstName: string;
  lastName: string;
  role: Role;
  isBlocked: boolean;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `pending`: not blocked, but the first password change is still owed. */
export type UserStatus = 'active' | 'blocked' | 'locked' | 'pending';

export interface IpBlock {
  ipKey: string;
  failedAttempts: number;
  lockedUntil: string;
}

export interface AdminUserQuery {
  q?: string | undefined;
  role?: Role | undefined;
  status?: UserStatus | undefined;
  page: number;
  pageSize: number;
}

export interface AdminUserPage {
  items: AdminUser[];
  page: number;
  pageSize: number;
  total: number;
}

/** The roles an account can be given through the API; the Administrator role cannot be assigned. */
export const ASSIGNABLE_ROLES = ['MANAGER', 'EMPLOYEE', 'GUEST'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export interface CreateUserRequest {
  login: string;
  firstName: string;
  lastName: string;
  role: AssignableRole;
}

/** The only fields an edit may carry; the server refuses anything else. */
export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  role?: AssignableRole;
}

export interface CreatedUser {
  user: AdminUser;
  /** The only time the plaintext exists: show it once, never store or log it. */
  temporaryPassword: { value: string; expiresAt: string };
}

/** What a password reset answers: the new temporary password, which exists only in this answer. */
export type PasswordReset = Pick<CreatedUser, 'temporaryPassword'>;

/** The global security settings (`SecuritySettings` on the server). `null` age: no expiry. */
export interface SecuritySettings {
  minPasswordLength: number;
  rejectPersonalDataInPassword: boolean;
  passwordMaxAgeDays: number | null;
  sessionIdleTimeoutMinutes: number;
  /** Failed attempts per login and 15-minute window before the account is locked. */
  maxFailedLoginAttempts: number;
  /** Failed attempts per IP address and 15-minute window before the address is blocked. */
  ipFailedAttemptLimit: number;
  /** Distinct logins failed from one address that raise a password-spraying event. */
  sprayingDistinctLoginThreshold: number;
  /** Days a security event is kept. */
  securityEventRetentionDays: number;
}

const USERS_URL = '/api/admin/users';
const SECURITY_SETTINGS_URL = '/api/admin/security-settings';
const IP_BLOCKS_URL = '/api/admin/ip-blocks';
const userUrl = (id: string) => `${USERS_URL}/${encodeURIComponent(id)}`;

/**
 * Typed client for `/api/admin/**`. Like `ApiClient` it uses relative URLs only, so the browser
 * talks to its own origin and the session cookie stays same-origin. The server decides who may
 * call what; nothing here is an access check.
 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  list(query: AdminUserQuery): Observable<AdminUserPage> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    const q = query.q?.trim();
    if (q) params = params.set('q', q);
    if (query.role) params = params.set('role', query.role);
    if (query.status) params = params.set('status', query.status);
    return this.http.get<AdminUserPage>(USERS_URL, { params });
  }

  get(id: string): Observable<AdminUser> {
    return this.http.get<AdminUser>(userUrl(id));
  }

  create(body: CreateUserRequest): Observable<CreatedUser> {
    return this.http.post<CreatedUser>(USERS_URL, body);
  }

  update(id: string, body: UpdateUserRequest): Observable<AdminUser> {
    return this.http.patch<AdminUser>(userUrl(id), body);
  }

  block(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${userUrl(id)}/block`, null);
  }

  unblock(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${userUrl(id)}/unblock`, null);
  }

  unlock(id: string): Observable<AdminUser> {
    return this.http.post<AdminUser>(`${userUrl(id)}/unlock`, null);
  }

  /**
   * Replaces the account's password with a temporary one and ends its sessions. The body is an
   * empty object, not nothing: the endpoint insists on JSON so a plain form post cannot trigger it.
   */
  resetPassword(id: string): Observable<PasswordReset> {
    return this.http.post<PasswordReset>(`${userUrl(id)}/reset-password`, {});
  }

  /** Soft delete: the server answers 204 and keeps the row. */
  delete(id: string): Observable<void> {
    return this.http.delete<void>(userUrl(id));
  }

  getSecuritySettings(): Observable<SecuritySettings> {
    return this.http.get<SecuritySettings>(SECURITY_SETTINGS_URL);
  }

  /** Any non-empty subset of the settings; the answer is all eight as stored. */
  updateSecuritySettings(changes: Partial<SecuritySettings>): Observable<SecuritySettings> {
    return this.http.patch<SecuritySettings>(SECURITY_SETTINGS_URL, changes);
  }

  listIpBlocks(): Observable<{ items: IpBlock[] }> {
    return this.http.get<{ items: IpBlock[] }>(IP_BLOCKS_URL);
  }

  clearIpBlock(ipKey: string): Observable<void> {
    return this.http.delete<void>(`${IP_BLOCKS_URL}/${encodeURIComponent(ipKey)}`);
  }
}
