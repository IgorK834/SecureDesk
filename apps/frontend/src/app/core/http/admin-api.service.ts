import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
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

export type SecurityEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type SecurityEventAcknowledged = boolean;

export interface SecurityEventQuery {
  type?: string;
  severity?: SecurityEventSeverity;
  acknowledged?: SecurityEventAcknowledged;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: SecurityEventSeverity;
  occurredAt: string;
  ipKey: string | null;
  subjectUserId: string | null;
  details: Record<string, unknown>;
  requestId: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  alertStatus: 'NONE' | 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED';
  alertAttemptedAt: string | null;
  detection?: { title: string; firstSeq: number; lastSeq: number };
}

export interface SecurityEventPage {
  items: SecurityEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export type AuditOutcome = 'SUCCESS' | 'FAILURE';
export interface DetectionRule {
  id: string;
  title: string;
  severity: SecurityEventSeverity;
  threshold: number;
  windowMinutes: number;
  lastAlertAt: string | null;
}
export type AuditExportFormat = 'csv' | 'jsonl';

export interface AuditFilters {
  user?: string;
  action?: string[];
  outcome?: AuditOutcome;
  from?: string;
  to?: string;
  fromSeq?: number;
  toSeq?: number;
}

export interface AuditEntry {
  seq: number;
  id: string;
  occurredAt: string;
  actor: { type: 'USER' | 'ANONYMOUS' | 'SYSTEM'; userId: string | null; login: string | null };
  subject: { login: string | null; ref: string | null };
  ip: string | null;
  action: string;
  description: string;
  outcome: AuditOutcome;
  details: Record<string, unknown>;
  requestId: string;
  prevHash: string;
  entryHash: string;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
}

export interface AuditProblem {
  seq: number | null;
  id: string | null;
  kind:
    | 'HASH_MISMATCH'
    | 'CHAIN_BROKEN'
    | 'SEQUENCE_GAP'
    | 'GENESIS_MISMATCH'
    | 'MALFORMED_ROW'
    | 'HEAD_MISMATCH';
}

export type AuditVerification = {
  verifiedAt: string;
  checkedEntries: number;
  warnings: 'ANCHOR_MISSING'[];
} & ({ status: 'INTACT' } | { status: 'TAMPERED'; firstProblem: AuditProblem });

export interface HoneytokenStatus {
  id: string;
  kind: 'ACCOUNT_TRAP' | 'AWS_KEYS';
  label: string;
  enabled: boolean;
  lastTriggeredAt: string | null;
  triggerCount: number;
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
const SECURITY_EVENTS_URL = '/api/admin/security-events';
const HONEYTOKENS_URL = '/api/admin/honeytokens';
const AUDIT_LOG_URL = '/api/admin/audit-log';
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

  listSecurityEvents(query: SecurityEventQuery): Observable<SecurityEventPage> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    if (query.type) params = params.set('type', query.type);
    if (query.severity) params = params.set('severity', query.severity);
    if (query.acknowledged !== undefined) {
      params = params.set('acknowledged', String(query.acknowledged));
    }
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return this.http.get<SecurityEventPage>(SECURITY_EVENTS_URL, { params });
  }

  acknowledgeSecurityEvent(id: string): Observable<SecurityEvent> {
    return this.http.post<SecurityEvent>(
      `${SECURITY_EVENTS_URL}/${encodeURIComponent(id)}/acknowledge`,
      null,
    );
  }

  listDetectionRules(): Observable<{ items: DetectionRule[] }> {
    return this.http.get<{ items: DetectionRule[] }>('/api/admin/detection-rules');
  }

  listAuditEntries(filters: AuditFilters, page: number, pageSize: number): Observable<AuditPage> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (filters.user) params = params.set('user', filters.user);
    if (filters.action?.length) params = params.set('action', filters.action.join(','));
    if (filters.outcome) params = params.set('outcome', filters.outcome);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);
    if (filters.fromSeq) params = params.set('fromSeq', filters.fromSeq);
    if (filters.toSeq) params = params.set('toSeq', filters.toSeq);
    return this.http.get<AuditPage>(AUDIT_LOG_URL, { params });
  }

  getAuditEntry(seq: number): Observable<AuditEntry> {
    return this.http.get<AuditEntry>(`${AUDIT_LOG_URL}/${seq}`);
  }

  getAuditIntegrity(): Observable<{ verification: AuditVerification | null }> {
    return this.http.get<{ verification: AuditVerification | null }>(`${AUDIT_LOG_URL}/integrity`);
  }

  verifyAuditIntegrity(): Observable<AuditVerification> {
    return this.http.post<AuditVerification>(`${AUDIT_LOG_URL}/verify`, null);
  }

  exportAuditEntries(
    filters: AuditFilters,
    format: AuditExportFormat,
  ): Observable<HttpResponse<Blob>> {
    return this.http.post(
      `${AUDIT_LOG_URL}/export`,
      { ...filters, format },
      {
        responseType: 'blob',
        observe: 'response',
      },
    );
  }

  listHoneytokens(): Observable<{ items: HoneytokenStatus[] }> {
    return this.http.get<{ items: HoneytokenStatus[] }>(HONEYTOKENS_URL);
  }

  testHoneytoken(id: string): Observable<{ eventId: string; test: true }> {
    return this.http.post<{ eventId: string; test: true }>(
      `${HONEYTOKENS_URL}/${encodeURIComponent(id)}/test`,
      null,
    );
  }
}
