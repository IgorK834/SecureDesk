import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/** Only a password-authenticated session waiting for its second factor may open this page. */
export const totpChallengeGuard: CanActivateFn = () => {
  const stage = inject(AuthService).authStage();
  const router = inject(Router);
  if (!stage) return router.parseUrl('/login');
  if (stage === 'TOTP_CHALLENGE') return true;
  if (stage === 'INITIAL_PASSWORD_CHANGE') return router.parseUrl('/change-initial-password');
  if (stage === 'PASSWORD_EXPIRED') return router.parseUrl('/account/change-password');
  return router.parseUrl('/dashboard');
};
