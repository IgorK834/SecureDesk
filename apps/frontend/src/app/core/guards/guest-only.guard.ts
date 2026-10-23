import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

/**
 * Keeps signed-in users off /login. The dashboard is the single place that decides where they
 * go next (`authGuard` forces a restricted session on to its password-change page from there).
 */
export const guestOnlyGuard: CanActivateFn = () =>
  inject(AuthService).user() ? inject(Router).parseUrl('/dashboard') : true;
