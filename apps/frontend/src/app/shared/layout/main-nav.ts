import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { visibleNavItems } from './nav-items';

/** The main menu: the dashboard plus the links this role may use. Hidden until fully signed in. */
@Component({
  selector: 'app-main-nav',
  imports: [RouterLink],
  template: `
    @if (signedIn()) {
      <nav aria-label="Main">
        <ul>
          <li><a routerLink="/dashboard">Dashboard</a></li>
          <li><a routerLink="/account/change-password">Change password</a></li>
          @for (item of items(); track item.route) {
            <li>
              <a [routerLink]="item.route">{{ item.label }}</a>
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
