import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, filter, finalize, of } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { MainNav } from './main-nav';
import { SecurityAlertService } from './security-alert.service';

const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: 'Administrator',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
  GUEST: 'Guest',
};

/** Shared frame for every signed-in stage. Authorization remains in the router and backend. */
@Component({
  selector: 'app-shell',
  imports: [MainNav, RouterLink],
  template: `
    <div class="screen">
      <div class="dots" aria-hidden="true"></div>
      @if (user(); as currentUser) {
        <header class="shell-header">
          <a class="brand" routerLink="/dashboard">
            <svg class="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
              <g fill="currentColor">
                <rect x="2" y="2" width="9" height="9" rx="2" />
                <circle cx="21" cy="6.5" r="3" />
                <circle cx="6.5" cy="21" r="3" />
                <rect x="16.5" y="16.5" width="9" height="9" rx="2" />
              </g>
            </svg>
            <span>SecureDesk</span>
          </a>
          <div class="nav-cluster">
            <app-main-nav />
            <button
              class="logout-button"
              type="button"
              [disabled]="loggingOut()"
              (click)="logout()"
            >
              {{ loggingOut() ? 'Signing out…' : 'Logout' }}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </button>
          </div>
          <p class="shell-eyebrow">
            <span>{{ currentUser.firstName }} {{ currentUser.lastName }}</span>
            <span aria-hidden="true">·</span>
            <span class="role-chip">{{ roleLabel() }}</span>
          </p>
        </header>
      }
      @if (user() && unacknowledgedCritical() > 0) {
        <aside class="security-banner" role="alert">
          <strong>
            {{ unacknowledgedCritical() }} unacknowledged critical security event(s).
          </strong>
          <a routerLink="/admin/security-events">Review security events</a>
        </aside>
      }
      <main class="shell-main"><ng-content /></main>
    </div>
  `,
})
export class AppShellComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly securityAlerts = inject(SecurityAlertService);

  protected readonly user = this.auth.user;
  protected readonly loggingOut = signal(false);
  protected readonly unacknowledgedCritical = this.securityAlerts.unacknowledgedCritical;
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.auth.has('security-events:read')) this.securityAlerts.load();
        else this.securityAlerts.clear();
      });
  }

  protected logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.api
      .logout()
      .pipe(
        catchError(() => of(undefined)),
        finalize(() => {
          this.auth.clear();
          this.securityAlerts.clear();
          this.loggingOut.set(false);
          void this.router.navigateByUrl('/login');
        }),
      )
      .subscribe();
  }
}
