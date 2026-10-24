import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Only the restricted first-login session may open the initial-password replacement page. */
export const initialChangeGuard: CanActivateFn = () => {
  const stage = inject(AuthService).authStage();
  const router = inject(Router);
  if (!stage) return router.parseUrl('/login');
  if (stage === 'INITIAL_PASSWORD_CHANGE') return true;
  return router.parseUrl(stage === 'PASSWORD_EXPIRED' ? '/account/change-password' : '/dashboard');
};
