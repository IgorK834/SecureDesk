import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { catchError, finalize, of } from 'rxjs';
import { AuthApiService } from '../../core/auth/auth-api.service';
import type { Role } from '../../core/auth/auth.models';
import { AuthService } from '../../core/auth/auth.service';
import { MainNav } from './main-nav';

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
    @if (user(); as currentUser) {
      <header>
        <a class="brand" routerLink="/dashboard">SecureDesk</a>
        <p>
          <span>{{ currentUser.firstName }} {{ currentUser.lastName }}</span>
          <span class="role">{{ roleLabel() }}</span>
        </p>
        <button type="button" [disabled]="loggingOut()" (click)="logout()">
          {{ loggingOut() ? 'Signing out…' : 'Logout' }}
        </button>
      </header>
    }
    <div [class.authenticated-layout]="user()">
      @if (user()) {
        <app-main-nav />
      }
      <main><ng-content /></main>
    </div>
  `,
  styles: `
    header {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #bbb;
    }
    header p {
      display: flex;
      gap: 0.5rem;
      margin: 0 0 0 auto;
    }
    .brand {
      color: inherit;
      font-size: 1.25rem;
      font-weight: bold;
      text-decoration: none;
    }
    .role {
      padding-inline: 0.5rem;
      border: 1px solid currentColor;
      border-radius: 0.75rem;
    }
    .authenticated-layout {
      display: grid;
      grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
      gap: 1.5rem;
      padding: 1rem;
    }
    main {
      min-width: 0;
    }
    @media (max-width: 42rem) {
      header,
      header p {
        align-items: flex-start;
        flex-direction: column;
      }
      header p {
        margin: 0;
      }
      .authenticated-layout {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AppShellComponent {
  private readonly api = inject(AuthApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly loggingOut = signal(false);
  protected readonly roleLabel = computed(() => {
    const role = this.user()?.role;
    return role ? ROLE_LABELS[role] : '';
  });

  protected logout(): void {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    this.api
      .logout()
      .pipe(
        catchError(() => of(undefined)),
        finalize(() => {
          this.auth.clear();
          this.loggingOut.set(false);
          void this.router.navigateByUrl('/login');
        }),
      )
      .subscribe();
  }
}
