// Builders for the administrator's user management specs. Excluded from coverage (see __fixtures__).
// Plain Vitest has no Angular compiler plugin: load the JIT compiler before `@angular/common/http`.
import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import type { AdminUser, AdminUserPage } from '../core/http/admin-api.service';

/** An active Employee; override what the test is about. */
export function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: 'u-1',
    login: 'employee1',
    firstName: 'Katarzyna',
    lastName: 'Wiśniewska',
    role: 'EMPLOYEE',
    isBlocked: false,
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    passwordChangedAt: '2030-01-02T10:00:00.000Z',
    createdAt: '2030-01-01T08:30:00.000Z',
    updatedAt: '2030-01-02T10:00:00.000Z',
    ...overrides,
  };
}

export function userPage(
  items: AdminUser[],
  overrides: Partial<AdminUserPage> = {},
): AdminUserPage {
  return { items, page: 1, pageSize: 20, total: items.length, ...overrides };
}

/** The server's refusal, with its `{ error: { code } }` envelope. */
export function apiFailure(status: number, code?: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    statusText: 'error',
    error: code ? { error: { code, message: 'x' } } : null,
  });
}
