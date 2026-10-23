import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import type { AuthStage } from '../auth/auth.models';
import { AuthService } from '../auth/auth.service';

// Route guards are a UX aid, NOT authorization. They only decide which screen the browser shows,
// from state the user controls (their own browser). Anyone can skip them by calling the API
// directly, so the backend re-checks the session, stage and permission of every request
// (tests/admin-routes-authz.test.ts proves the 403). Never rely on a guard to protect data.

/** Where a session that still owes a password change must go; every other page sends it there. */
const FORCED_ROUTE: Partial<Record<AuthStage, string>> = {
  INITIAL_PASSWORD_CHANGE: '/change-initial-password',
  PASSWORD_EXPIRED: '/account/change-password',
};

/** Requires a signed-in user, and keeps a restricted session on its password-change page. */
export const authGuard: CanActivateFn = (_route, state) => {
  const stage = inject(AuthService).authStage();
  const router = inject(Router);

  if (!stage) return router.parseUrl('/login');

  const forced = FORCED_ROUTE[stage];
  const path = state.url.split(/[?#;]/)[0];
  if (forced && path !== forced) return router.parseUrl(forced);

  return true;
};
