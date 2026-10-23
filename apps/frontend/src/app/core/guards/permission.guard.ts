import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { Permission } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';

/** The `data` a route sets for `permissionGuard`: one permission, or any one of a list. */
export interface PermissionRouteData {
  permission: Permission | readonly Permission[];
}

/**
 * Sends the user to /forbidden unless the role holds the permission declared in the route's
 * `data` (e.g. `data: { permission: 'users:read' } satisfies PermissionRouteData`). Use it after
 * `authGuard`. UX only: the backend enforces the same permission on the API (see `auth.guard.ts`).
 */
export const permissionGuard: CanActivateFn = (route) => {
  const required = route.data['permission'] as PermissionRouteData['permission'] | undefined;

  // Deny by default: a route that forgot to declare its permission is closed, not open.
  if (required !== undefined && inject(AuthService).has(required)) return true;
  return inject(Router).parseUrl('/forbidden');
};
