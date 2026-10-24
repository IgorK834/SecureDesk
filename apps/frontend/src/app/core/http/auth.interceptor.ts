import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { describeApiError } from './api-error';

const isUnauthenticatedBootstrap = (method: string, url: string): boolean =>
  (method === 'POST' && url === '/api/auth/login') || (method === 'GET' && url === '/api/auth/me');

/** Keeps router state aligned with authentication and authorization refusals from the server. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const { status, code } = describeApiError(error);
        if (status === 401 && !isUnauthenticatedBootstrap(request.method, request.url)) {
          auth.clear();
          void router.navigate(['/login'], { queryParams: { reason: 'session-expired' } });
        } else if (status === 403 && code === 'AUTH_PASSWORD_CHANGE_REQUIRED') {
          const stage = auth.authStage();
          if (stage === 'INITIAL_PASSWORD_CHANGE') {
            void router.navigateByUrl('/change-initial-password');
          } else if (stage === 'PASSWORD_EXPIRED') {
            void router.navigateByUrl('/account/change-password');
          }
        } else if (status === 403) {
          void router.navigateByUrl('/forbidden');
        }
      }
      return throwError(() => error);
    }),
  );
};
