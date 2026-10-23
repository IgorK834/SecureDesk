import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import {
  type CanActivateFn,
  type ActivatedRouteSnapshot,
  type Data,
  type RouterStateSnapshot,
  Router,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import type { AuthStage, MeResponse, Permission, Role } from '../core/auth/auth.models';
import { AuthService } from '../core/auth/auth.service';
import { ApiClient } from '../core/http/api-client.service';

/**
 * What `/api/auth/me` reports per role (docs/permissions.md, section "Role matrix").
 * tests/role-navigation.test.ts fails if this drifts from the backend's matrix.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMINISTRATOR: [
    'users:read',
    'users:create',
    'users:update',
    'users:block',
    'users:delete',
    'users:reset-password',
    'security-settings:read',
    'security-settings:update',
  ],
  MANAGER: [
    'tickets:create',
    'tickets:read:all',
    'tickets:read:assigned',
    'tickets:read:own',
    'tickets:assign',
    'tickets:status:update:all',
    'tickets:status:update:assigned',
  ],
  EMPLOYEE: [
    'tickets:create',
    'tickets:read:assigned',
    'tickets:read:own',
    'tickets:status:update:assigned',
  ],
  GUEST: ['tickets:create', 'tickets:read:own'],
};

export function meResponse(
  role: Role,
  authStage: AuthStage = 'FULLY_AUTHENTICATED',
  permissions: readonly string[] = ROLE_PERMISSIONS[role],
): MeResponse {
  return {
    user: { id: `id-${role}`, login: role.toLowerCase(), firstName: 'Ann', lastName: 'Test', role },
    authStage,
    mustChangePassword: authStage === 'INITIAL_PASSWORD_CHANGE',
    permissions: [...permissions],
    passwordPolicy: { minPasswordLength: 12, rejectPersonalDataInPassword: false },
  };
}

/** The server's answer for a missing or invalid session cookie. */
export const unauthorized = () =>
  new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url: '/api/auth/me' });

/**
 * Configures TestBed with a real AuthService whose `/api/auth/me` answers `me` (401 for null) and
 * loads it, like the app does at start-up. `meCall` is the spy behind `ApiClient.me()`.
 */
export async function loadAuth(me: MeResponse | null) {
  const meCall = vi.fn(() => (me ? of(me) : throwError(unauthorized)));
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: ApiClient, useValue: { me: meCall } }],
  });
  const auth = TestBed.inject(AuthService);
  await auth.load();
  return { auth, meCall };
}

interface GuardInput {
  url?: string;
  data?: Data;
}

/**
 * Runs a guard as the router would, against the AuthService already loaded by `loadAuth`, and
 * reports the outcome: `true` to allow, otherwise the URL it redirects to.
 */
export function executeGuard(
  guard: CanActivateFn,
  { url = '/dashboard', data = {} }: GuardInput = {},
): true | string {
  const result = TestBed.runInInjectionContext(() =>
    guard({ data } as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
  if (result === true) return true;
  if (result instanceof UrlTree) return TestBed.inject(Router).serializeUrl(result);
  throw new Error(`Guard returned neither true nor a redirect: ${String(result)}`);
}

/** `loadAuth` for a user (`me`, or null for nobody), then `executeGuard`. */
export async function runGuard(
  guard: CanActivateFn,
  { me, ...input }: GuardInput & { me: MeResponse | null },
): Promise<true | string> {
  await loadAuth(me);
  return executeGuard(guard, input);
}
