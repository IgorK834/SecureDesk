import { DatePipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import type { AdminUser } from '../../core/http/admin-api.service';
import { STATUS_LABELS, hasExpiredTemporaryPassword, userStatus } from './user-status';

/**
 * Active, Blocked, temporarily Locked or Pending first login. The state is written out in words,
 * so it does not depend on seeing the colour. A pending account whose temporary password has run
 * out says so: it can no longer sign in until the administrator issues a new one.
 */
@Component({
  selector: 'app-user-status-badge',
  imports: [DatePipe],
  template: `
    <span class="badge" [class]="'badge badge-' + status">
      @if (status === 'locked') {
        Locked until {{ user.lockedUntil | date: 'HH:mm' }}
      } @else {
        {{ label }}
      }
    </span>
    @if (expired) {
      <span class="hint">Temporary password expired</span>
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
