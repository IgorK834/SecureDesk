import { Component, Input } from '@angular/core';
import type { AdminUser } from '../../core/http/admin-api.service';
import { STATUS_LABELS, hasExpiredTemporaryPassword, userStatus } from './user-status';

/**
 * Active, Blocked or Pending first login. The state is written out in words, not only coloured,
 * so it does not depend on seeing the colour. A pending account whose temporary password has run
 * out says so: it can no longer sign in until the administrator issues a new one.
 */
@Component({
  selector: 'app-user-status-badge',
  template: `
    <span class="badge" [class]="'badge badge-' + status">{{ label }}</span>
    @if (expired) {
      <span class="hint">Temporary password expired</span>
    }
  `,
  styles: `
    .badge {
      display: inline-block;
      padding: 0 0.5em;
      border: 1px solid currentColor;
      border-radius: 0.75em;
      font-size: 0.875em;
    }
    .badge-active {
      color: #146c2e;
    }
    .badge-blocked {
      color: #b3261e;
    }
    .badge-pending {
      color: #8a5100;
    }
    .hint {
      margin-left: 0.5em;
      font-size: 0.875em;
      color: #8a5100;
    }
  `,
})
export class UserStatusBadgeComponent {
  // Decorator-based on purpose, here and in the other components of this feature: the root Vitest
  // run has no Angular JIT transform, so `input()`, `output()` and `viewChild()` do not work in it.
  @Input({ required: true }) user!: AdminUser;

  protected get status() {
    return userStatus(this.user);
  }

  protected get label() {
    return STATUS_LABELS[this.status];
  }

  protected get expired() {
    return hasExpiredTemporaryPassword(this.user);
  }
}
