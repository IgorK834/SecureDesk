import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { visibleNavItems } from './nav-items';

/** The main menu: the dashboard plus the links this role may use. Hidden until fully signed in. */
@Component({
  selector: 'app-main-nav',
  imports: [RouterLink, RouterLinkActive],
  template: `
    @if (signedIn()) {
      <nav aria-label="Main">
        <ul>
          <li>
            <a
              routerLink="/dashboard"
              routerLinkActive="on"
              [routerLinkActiveOptions]="{ exact: true }"
              ariaCurrentWhenActive="page"
              >Dashboard</a
            >
          </li>
          <li>
            <a
              routerLink="/account/change-password"
              routerLinkActive="on"
              ariaCurrentWhenActive="page"
              >Change password</a
            >
          </li>
          <li>
            <a
              routerLink="/account/two-factor-authentication"
              routerLinkActive="on"
              ariaCurrentWhenActive="page"
              >Two-factor authentication</a
            >
          </li>
          @for (item of items(); track item.route) {
            <li>
              <a [routerLink]="item.route" routerLinkActive="on" ariaCurrentWhenActive="page">{{
                item.label
              }}</a>
            </li>
          }
        </ul>
      </nav>
    }
  `,
})
export class MainNav {
  private readonly auth = inject(AuthService);

  protected readonly signedIn = computed(() => this.auth.authStage() === 'FULLY_AUTHENTICATED');
  protected readonly items = computed(() => visibleNavItems(this.auth));
}
